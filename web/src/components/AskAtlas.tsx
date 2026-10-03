import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import type { Atlas, DiseaseKey } from "../lib/types";
import { answer, type Answer } from "../lib/ask";
import { KindBadge } from "./Provenance";

interface Msg {
  role: "user" | "atlas";
  text: string;
  a?: Answer;
  narrated?: boolean;
}

const SUGGESTIONS = [
  "How many PKU babies are born in Tunisia each year?",
  "Why is the risk so high in Pakistan?",
  "Which genes should Egypt test first?",
  "Combien d'enfants atteints de mucoviscidose naissent au Maroc ?",
  "كم طفلًا مصابًا ببيلة الفينيل كيتون يولد في السودان سنويًا؟",
  "What is the best treatment for my son?",
];

/** Render **bold** and *italic* without injecting HTML. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <em key={i}>{p.slice(1, -1)}</em>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

async function narrate(question: string, a: Answer, signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, lang: a.lang, grounded: a.text, facts: a.facts, citations: a.citations.map((c) => c.label) }),
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { text?: string };
    return typeof body.text === "string" && body.text.trim() ? body.text.trim() : null;
  } catch {
    return null;
  }
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
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    const a = answer(atlas, question, disease, country);
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const narrated = a.refused ? null : await narrate(question, a, ctrl.signal);
    clearTimeout(timer);
    setMsgs((m) => [...m, { role: "atlas", text: narrated ?? a.text, a, narrated: Boolean(narrated) }]);
    setBusy(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/25 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask the Atlas"
        className="rise flex h-full w-full max-w-lg flex-col bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2 font-serif text-2xl">
              <MessageCircleQuestion size={20} className="text-brand" /> Ask the Atlas
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
              <ShieldCheck size={13} /> Answers only from the atlas · English · Français · العربية
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
                Ask in your own language. Every number comes from the computed atlas, with its source. The atlas never gives medical
                advice about a person.
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
              <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-card px-3.5 py-3 text-sm">
                <div dir="auto" className="leading-relaxed">
                  <Rich text={m.text} />
                </div>
                {m.a?.refused && (
                  <div className="mt-2 chip" style={{ background: "#fbe6dc", color: "#b5441f" }}>
                    <ShieldCheck size={12} /> guardrail: no individual medical advice
                  </div>
                )}
                {m.a && m.a.citations.length > 0 && (
                  <ol className="mt-2.5 space-y-1 border-t border-line pt-2">
                    {m.a.citations.map((c, j) => (
                      <li key={j} className="flex items-center justify-between gap-2 text-xs">
                        <a
                          href={c.url}
                          target={c.url.startsWith("#") ? undefined : "_blank"}
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
                <div className="mt-2 flex items-center gap-1 text-[0.68rem] text-ink-3">
                  {m.narrated ? (
                    <>
                      <Sparkles size={11} /> phrased by the AI narrator from verified facts
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={11} /> deterministic grounded engine
                    </>
                  )}
                </div>
              </div>
            ),
          )}
          {busy && <div className="text-xs text-ink-3">Looking it up in the atlas…</div>}
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
            placeholder="e.g. How many CF babies are born in Pakistan?"
            className="flex-1 rounded-full border border-line bg-card px-4 py-2.5 text-sm outline-none focus:border-brand"
            aria-label="Your question"
            maxLength={400}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-full bg-brand px-4 text-paper disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
