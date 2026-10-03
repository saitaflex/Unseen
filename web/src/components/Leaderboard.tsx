import { EyeOff } from "lucide-react";
import type { CellView } from "../lib/types";
import { unseenScore } from "../lib/data";
import { fmtCount, fmtRatio } from "../lib/format";

interface Props {
  cells: CellView[];
  selected: string | null;
  onSelect: (iso3: string) => void;
}

export function Leaderboard({ cells, selected, onSelect }: Props) {
  const ranked = [...cells].sort((a, b) => unseenScore(b) - unseenScore(a));
  const max = Math.max(1, ...ranked.map((c) => c.expected.median));
  return (
    <section className="card p-5" aria-labelledby="lb-title">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
        <EyeOff size={14} /> Most unseen
      </div>
      <h3 id="lb-title" className="font-display text-2xl mt-1">Large burden, little attention</h3>
      <p className="text-xs text-ink-3 mt-1">Ranked by expected births ÷ research attention.</p>
      <ol className="mt-3 space-y-1">
        {ranked.map((c, i) => {
          const low = c.attention !== null && c.attention < 0.5;
          return (
            <li key={c.country.iso3}>
              <button
                onClick={() => onSelect(c.country.iso3)}
                className={`grid w-full grid-cols-[1.25rem_1fr_auto_auto] items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-paper-2/70 ${
                  selected === c.country.iso3 ? "bg-paper-2" : ""
                }`}
              >
                <span className="num text-xs text-ink-3">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate">{c.country.name}</span>
                  <span className="mt-0.5 block h-1 rounded-full bg-paper-2 overflow-hidden">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(c.expected.median / max) * 100}%`, background: low ? "#e0623a" : "#259978" }}
                    />
                  </span>
                </span>
                <span className="num text-xs text-ink-2">{fmtCount(c.expected.median)}/yr</span>
                <span
                  className="num chip"
                  style={{ background: low ? "#fbe6dc" : "#dff1e9", color: low ? "#b5441f" : "#0f5c46" }}
                >
                  {fmtRatio(c.attention)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
