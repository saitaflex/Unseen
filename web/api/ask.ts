/**
 * Optional AI narrator (Vercel Function). It only rephrases facts the deterministic engine
 * already verified — it receives no data it could misuse and is told never to add numbers.
 * Without OPENAI_API_KEY it returns 501 and the UI keeps the grounded answer.
 */
const MAX_LEN = 4000;

// Minimal typing for the Node env object, so this function type-checks without @types/node.
declare const process: { env: Record<string, string | undefined> };

export async function POST(request: Request): Promise<Response> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "narrator disabled" }, { status: 501 });

  let body: { question?: unknown; lang?: unknown; grounded?: unknown; facts?: unknown; citations?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.slice(0, 400) : "";
  const grounded = typeof body.grounded === "string" ? body.grounded.slice(0, MAX_LEN) : "";
  const lang = body.lang === "fr" || body.lang === "ar" ? body.lang : "en";
  const facts = JSON.stringify(body.facts ?? {}).slice(0, MAX_LEN);
  const citations = Array.isArray(body.citations) ? body.citations.slice(0, 12).map(String) : [];
  if (!question || !grounded) return Response.json({ error: "missing fields" }, { status: 400 });

  const system = [
    "You are the narrator of UNSEEN, a population-genetics atlas of undiagnosed rare-disease patients.",
    "Rewrite the GROUNDED ANSWER so it reads naturally and directly answers the QUESTION.",
    "Rules: use ONLY numbers and claims present in GROUNDED ANSWER or FACTS; never add, round differently or invent numbers;",
    "never give individual medical advice; keep it under 90 words; keep **bold** markers on the key numbers;",
    `answer in ${lang === "fr" ? "French" : lang === "ar" ? "Arabic" : "English"}; reference sources as [1], [2]… in the order of CITATIONS when you use them.`,
  ].join(" ");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `QUESTION: ${question}\n\nGROUNDED ANSWER: ${grounded}\n\nFACTS: ${facts}\n\nCITATIONS: ${citations.map((c, i) => `[${i + 1}] ${c}`).join("; ")}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(11000),
    });
    if (!res.ok) return Response.json({ error: `upstream ${res.status}` }, { status: 502 });
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return Response.json({ error: "empty" }, { status: 502 });
    return Response.json({ text });
  } catch {
    return Response.json({ error: "narrator unavailable" }, { status: 502 });
  }
}
