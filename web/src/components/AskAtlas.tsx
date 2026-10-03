import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Bot, Cpu, MessageCircleQuestion, Send, ShieldCheck, Wrench, X } from "lucide-react";
import type { Atlas, DiseaseKey } from "../lib/types";
import { answer, type Answer, type Citation } from "../lib/ask";
import { KindBadge } from "./Provenance";

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  ok?: boolean;
}
interface Msg {
  role: "user" | "atlas";
  text: string;
  citations?: Citation[];
  tools?: ToolCall[];
  mode?: "agent" | "offline";
  model?: string;
  verification?: { checked: number; grounded: number };
  refused?: boolean;
  note?: string;
}

const SUGGESTIONS = [
  "Where are PKU patients most unseen, and why?",
  "How is the PKU estimate for Tunisia calculated?",
  "Does Pakistan have newborn screening? What does the gap cost?",
  "Compare cystic fibrosis in Tunisia, Egypt and France",
  "Combien d'enfants atteints de mucoviscidose naissent au Maroc ?",
  "كم طفلًا مصابًا ببيلة الفينيل كيتون يولد في السودان سنويًا؟",
  "What is the best treatment for my son?",
];

/** Render **bold**, *italic* and [n] citation markers without injecting HTML. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[\d+\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : /^\[\d+\]$/.test(p) ? (
          <sup key={i} className="text-brand-deep">{p}</sup>
        ) : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <em key={i}>{p.slice(1, -1)}</em>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const fmtArgs = (a: Record<string, unknown>) =>
  Object.entries(a)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");

async function askAgent(question: string, history: Msg[], signal: AbortSignal) {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      history: history.slice(-6).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })),
    }),
    signal,
  });
  const body = (await res.json().catch(() => ({}))) as {
    text?: string; tools?: ToolCall[]; sources?: { label: string; url: string }[];
    verification?: { checked: number; grounded: number }; model?: string; error?: string;
  };
  return { status: res.status, body };
}

interface Props {
  atlas: Atlas;
  open: boolean;
  onClose: () => void;
  disease: DiseaseKey;
  country: string | null;
}

export function AskAtlas({ atlas, open, onClose, disease, country }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [agentAvailable, setAgentAvailable] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const offline = (q: string, note?: string): Msg => {
    const a: Answer = answer(atlas, q, disease, country);
    return { role: "atlas", text: a.text, citations: a.citations, tools: a.tools, mode: "offline", refused: a.refused, note };
  };

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    const history = msgs;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    const local = answer(atlas, question, disease, country);
    if (local.refused || agentAvailable === false) {
      setMsgs((m) => [...m, offline(question)]);
      return;
    }
    setBusy(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);
    let reply: Msg;
    try {
      const { status, body } = await askAgent(question, history, ctrl.signal);
      if (status === 200 && body.text) {
        setAgentAvailable(true);
        reply = {
          role: "atlas", text: body.text, tools: body.tools, mode: "agent", model: body.model, verification: body.verification,
          citations: (body.sources ?? []).map((s) => ({ ...s, kind: "observed" as const })),
        };
      } else if (status === 501) {
        setAgentAvailable(false);
        reply = offline(question);
      } else if (status === 422) {
        reply = offline(question);
      } else {
        reply = offline(question, status === 409 ? "The AI's draft contained a number it couldn't trace to the atlas, so the verified offline answer is shown." : undefined);
      }
    } catch {
      reply = offline(question);
    }
    clearTimeout(timer);
    setMsgs((m) => [...m, reply]);
    setBusy(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/25 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask the Atlas"
        className="rise flex h-full w-full max-w-xl flex-col bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2 font-display text-2xl font-semibold">
              <MessageCircleQuestion size={20} className="text-brand" /> Ask the Atlas
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
              <ShieldCheck size={13} /> Tool-calling agent · every number verified · English · Français · العربية
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-paper-2" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {msgs.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-ink-2">
                The agent can only read the atlas through 7 tools. Before you see an answer, every number in it is checked
                against what the tools returned.
              </p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  dir="auto"
                  className="block w-full rounded-2xl border border-line bg-card px-3.5 py-2.5 text-left text-sm hover:border-brand/50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} dir="auto" className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-sm text-paper">
                {m.text}
              </div>
            ) : (
              <div key={i} className="max-w-[94%] space-y-2 rounded-2xl rounded-bl-md border border-line bg-card px-3.5 py-3 text-sm">
                {m.tools && m.tools.length > 0 && (
                  <div className="space-y-1 rounded-xl bg-paper-2/70 p-2">
                    {m.tools.map((t, j) => (
                      <div key={j} className="flex items-start gap-1.5 text-[0.72rem] text-ink-2">
                        <Wrench size={12} className="mt-0.5 shrink-0 text-brand" />
                        <span className="num font-semibold text-ink">{t.name}</span>
                        <span className="truncate text-ink-3">{fmtArgs(t.args)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div dir="auto" className="whitespace-pre-line leading-relaxed">
                  <Rich text={m.text} />
                </div>
                {m.note && <div className="rounded-lg bg-[#fbf3e1] px-2.5 py-1.5 text-xs text-[#6b4706]">{m.note}</div>}
                {m.refused && (
                  <div className="chip" style={{ background: "#fbe6dc", color: "#b5441f" }}>
                    <ShieldCheck size={12} /> guardrail: no individual medical advice
                  </div>
                )}
                {m.citations && m.citations.length > 0 && (
                  <ol className="space-y-1 border-t border-line pt-2">
                    {m.citations.map((c, j) => (
                      <li key={j} className="flex items-center justify-between gap-2 text-xs">
                        <a
                          href={c.url}
                          target={c.url.startsWith("#") || c.url.startsWith("/") ? undefined : "_blank"}
                          rel="noreferrer"
                          className="truncate text-brand-deep underline decoration-brand/30 underline-offset-2"
                        >
                          [{j + 1}] {c.label}
                        </a>
                        <KindBadge kind={c.kind} />
                      </li>
                    ))}
                  </ol>
                )}
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] text-ink-3">
                  {m.mode === "agent" ? (
                    <span className="flex items-center gap-1"><Bot size={11} /> AI agent{m.model ? ` · ${m.model}` : ""}</span>
                  ) : (
                    <span className="flex items-center gap-1"><Cpu size={11} /> offline grounded engine</span>
                  )}
                  {m.verification && m.verification.checked > 0 && (
                    <span className="chip" style={{ background: "#dff1e9", color: "#0f5c46" }}>
                      <BadgeCheck size={11} /> {m.verification.grounded}/{m.verification.checked} numbers verified
                    </span>
                  )}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <span className="h-2 w-2 animate-ping rounded-full bg-brand" /> The agent is calling tools…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="flex gap-2 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            dir="auto"
            placeholder="Ask about any disease, country or calculation…"
            className="flex-1 rounded-full border border-line bg-card px-4 py-2.5 text-sm outline-none focus:border-brand"
            aria-label="Your question"
            maxLength={600}
          />
          <button type="submit" disabled={busy || !input.trim()} className="rounded-full bg-brand px-4 text-paper disabled:opacity-40" aria-label="Send">
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
