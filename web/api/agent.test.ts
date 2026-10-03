import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const atlasText = readFileSync(new URL("../public/data/atlas.json", import.meta.url), "utf8");

type Scripted = { tool_calls?: { name: string; args: Record<string, unknown> }[]; content?: string };

/** Fake OpenAI: replays scripted assistant turns and records what the agent sent. */
function mockOpenAI(script: Scripted[]) {
  const sent: { messages: { role: string; content: string | null }[] }[] = [];
  let turn = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/data/atlas.json")) return new Response(atlasText, { status: 200 });
    if (u.includes("api.openai.com")) {
      sent.push(JSON.parse(String(init?.body)));
      const s = script[Math.min(turn++, script.length - 1)];
      const message = s.tool_calls
        ? { role: "assistant", content: null, tool_calls: s.tool_calls.map((t, i) => ({ id: `call_${turn}_${i}`, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) } })) }
        : { role: "assistant", content: s.content ?? "" };
      return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  }));
  return sent;
}

const req = (question: string) =>
  new Request("https://unseen.test/api/agent", { method: "POST", body: JSON.stringify({ question }), headers: { "Content-Type": "application/json" } });

async function freshAgent() {
  vi.resetModules();
  return import("./agent");
}

const atlas = JSON.parse(atlasText);
const pku = atlas.pairs.find((p: { disease: string; country: string }) => p.disease === "pku" && p.country === "SDN");
const med = Math.round(pku.expected_births.median);

describe("agent loop", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "test-key"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns 501 without a key (client falls back to the offline engine)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { POST } = await freshAgent();
    expect((await POST(req("hi"))).status).toBe(501);
  });

  it("refuses individual medical advice before calling the model", async () => {
    const sent = mockOpenAI([{ content: "should never be called" }]);
    const { POST } = await freshAgent();
    const res = await POST(req("What is the best treatment for my son?"));
    expect(res.status).toBe(422);
    expect(sent).toHaveLength(0);
  });

  it("calls tools, then answers with verified numbers", async () => {
    const sent = mockOpenAI([
      { tool_calls: [{ name: "get_estimate", args: { disease: "PKU", country: "Sudan" } }] },
      { content: `Genetics expects about **${med}** PKU births a year in Sudan [1].` },
    ]);
    const { POST } = await freshAgent();
    const res = await POST(req("How many PKU babies are born in Sudan?"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.tools).toEqual([{ name: "get_estimate", args: { disease: "PKU", country: "Sudan" }, ok: true }]);
    expect(body.verification.ungrounded).toEqual([]);
    expect(body.sources.length).toBeGreaterThan(0);
    // the tool result was actually sent back to the model
    expect(sent[1].messages.some((m) => m.role === "tool" && String(m.content).includes("expected_affected_births_per_year"))).toBe(true);
  });

  it("catches an invented number and accepts the corrected answer", async () => {
    mockOpenAI([
      { tool_calls: [{ name: "get_estimate", args: { disease: "pku", country: "SDN" } }] },
      { content: "About 98765 PKU births a year." },
      { content: `About **${med}** PKU births a year.` },
    ]);
    const { POST } = await freshAgent();
    const body = await (await POST(req("PKU in Sudan?"))).json();
    expect(body.text).toContain(String(med));
    expect(body.verification.ungrounded).toEqual([]);
  });

  it("rejects an answer that stays ungrounded (409)", async () => {
    mockOpenAI([
      { tool_calls: [{ name: "get_estimate", args: { disease: "pku", country: "SDN" } }] },
      { content: "About 98765 births." },
      { content: "Still 98765 births." },
    ]);
    const { POST } = await freshAgent();
    const res = await POST(req("PKU in Sudan?"));
    expect(res.status).toBe(409);
    expect((await res.json()).ungrounded).toEqual([98765]);
  });
});
