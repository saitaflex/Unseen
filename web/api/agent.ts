/**
 * UNSEEN research agent (Vercel Function, OpenAI tool calling).
 *
 * The model never sees the atlas directly: it can only call the typed tools in src/lib/tools.ts.
 * After it answers, every number in the answer is checked against the numbers the tools returned
 * (verifyNumbers). If anything is ungrounded it gets one chance to fix it; otherwise the client
 * falls back to the deterministic engine. Individual medical advice is refused before any model call.
 */
import { TOOL_SPECS, runTool, verifyNumbers, type ToolSource } from "../src/lib/tools";
import type { Atlas } from "../src/lib/types";

declare const process: { env: Record<string, string | undefined> };

export const maxDuration = 60;

const MEDICAL = /\b(treat(ment)?|cure|dose|medication|my (son|daughter|child|baby|wife|husband)|should i take)\b|traitement|mon (fils|enfant|bébé)|ma fille|علاج|ابني|ابنتي|طفلي|دواء/i;
const MAX_STEPS = 6;

let atlasCache: Promise<Atlas> | null = null;
function getAtlas(origin: string): Promise<Atlas> {
  atlasCache ??= fetch(new URL("/data/atlas.json", origin)).then((r) => {
    if (!r.ok) throw new Error(`atlas ${r.status}`);
    return r.json() as Promise<Atlas>;
  });
  atlasCache.catch(() => (atlasCache = null));
  return atlasCache;
}

const SYSTEM = `You are UNSEEN's research agent: an expert in population genetics and rare-disease epidemiology working
over a computed atlas of 22 autosomal-recessive diseases x 18 countries.

Rules (non-negotiable):
1. Facts and numbers come ONLY from tool results. Call tools first; never answer from memory.
2. Do not compute new numbers yourself (no adding, dividing or converting); quote the tools' numbers as given.
   You may round them sensibly. Always give the 90% interval when you state an expected-births figure.
3. If a question needs several facts, call several tools (e.g. get_estimate + country_profile + explain_calculation).
4. Explain like a scientist talking to a health minister: short, concrete, cite sources inline as [1], [2]
   matching the order of the sources you relied on. Mention caveats the tools return.
5. Population-level only. Never give individual medical advice or diagnoses.
6. If the atlas has no supported evidence (unmodelled disease or country), say so and say what data would change that.
7. Answer in the user's language (English, French or Arabic). Max ~170 words unless the user asks for detail.`;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

async function chat(key: string, model: string, messages: ChatMessage[], withTools: boolean) {
  const body: Record<string, unknown> = { model, messages };
  if (withTools) {
    body.tools = TOOL_SPECS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    body.tool_choice = "auto";
  }
  if (/^(gpt-5|o\d)/.test(model)) body.reasoning_effort = "low";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices: { message: ChatMessage }[] };
  return data.choices[0].message;
}

export async function POST(request: Request): Promise<Response> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "agent disabled: set OPENAI_API_KEY" }, { status: 501 });
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  let body: { question?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 600) : "";
  if (!question) return Response.json({ error: "missing question" }, { status: 400 });
  if (MEDICAL.test(question)) return Response.json({ error: "medical", refused: true }, { status: 422 });

  const history = Array.isArray(body.history)
    ? (body.history as { role?: unknown; content?: unknown }[])
        .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-6)
        .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 1200) }))
    : [];

  let atlas: Atlas;
  try {
    atlas = await getAtlas(new URL(request.url).origin);
  } catch {
    return Response.json({ error: "atlas unavailable" }, { status: 503 });
  }

  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM }, ...history, { role: "user", content: question }];
  const calls: { name: string; args: Record<string, unknown>; ok: boolean }[] = [];
  const outputs: unknown[] = [];
  const sources: ToolSource[] = [];

  try {
    let answer = "";
    for (let step = 0; step < MAX_STEPS; step++) {
      const msg = await chat(key, model, messages, true);
      messages.push(msg);
      if (!msg.tool_calls?.length) {
        answer = msg.content ?? "";
        break;
      }
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* model sent invalid JSON; the tool will report missing fields */
        }
        const result = runTool(atlas, tc.function.name, args);
        calls.push({ name: tc.function.name, args, ok: result.ok });
        if (result.ok) {
          outputs.push(result.data);
          for (const s of result.sources ?? []) if (!sources.some((x) => x.url === s.url)) sources.push(s);
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 12000) });
      }
    }
    if (!answer) return Response.json({ error: "no answer" }, { status: 502 });

    let check = verifyNumbers(answer, outputs);
    if (check.ungrounded.length > 0) {
      messages.push({
        role: "user",
        content: `Verifier: these numbers are not in any tool result: ${check.ungrounded.join(", ")}. Rewrite the answer using only numbers returned by the tools (call more tools if needed).`,
      });
      const fix = await chat(key, model, messages, false);
      const fixed = fix.content ?? "";
      const check2 = verifyNumbers(fixed, outputs);
      if (check2.ungrounded.length === 0 && fixed) {
        answer = fixed;
        check = check2;
      } else {
        return Response.json({ error: "ungrounded", ungrounded: check2.ungrounded, tools: calls }, { status: 409 });
      }
    }
    return Response.json({ text: answer, tools: calls, sources: sources.slice(0, 12), verification: check, model });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "agent failed", tools: calls }, { status: 502 });
  }
}
