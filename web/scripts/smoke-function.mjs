// Load api/agent.ts the way Vercel runs it: transpiled to ES modules and imported by plain Node
// (no Vite resolver). Catches missing file extensions and other runtime-only import errors.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { transformSync } from "rolldown/experimental"; // Vite 8's own TS transformer (oxc)

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "unseen-fn-"));
for (const f of ["api/agent.ts", "src/lib/tools.ts", "src/lib/types.ts"]) {
  const result = transformSync(f, fs.readFileSync(path.join(root, f), "utf8"), { lang: "ts" });
  if (result.errors?.length) throw new Error(`${f}: ${result.errors.map((e) => e.message).join("; ")}`);
  const js = result.code;
  const dest = path.join(out, f.replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
}
fs.writeFileSync(path.join(out, "package.json"), '{"type":"module"}');

delete process.env.OPENAI_API_KEY;
const mod = await import(pathToFileURL(path.join(out, "api/agent.js")).href);
const res = await mod.POST(new Request("https://smoke.test/api/agent", { method: "POST", body: JSON.stringify({ question: "hi" }) }));
if (res.status !== 501) {
  console.error(`expected 501 without a key, got ${res.status}`);
  process.exit(1);
}
console.log("function loads in plain Node ESM and answers 501 without a key ✓");
