import { useMemo, useState } from "react";
import { Baby, TestTubes } from "lucide-react";
import type { PanelGene } from "../lib/data";
import { fmtCount, fmtPct } from "../lib/format";

interface Props {
  countryName: string;
  genes: PanelGene[];
}

export function PanelOptimizer({ countryName, genes }: Props) {
  const [k, setK] = useState(10);
  const total = useMemo(() => genes.reduce((a, g) => a + g.expected, 0), [genes]);
  const picked = genes.slice(0, k);
  const covered = picked.reduce((a, g) => a + g.expected, 0);
  const max = genes[0]?.expected ?? 1;
  const nbs = genes.filter((g) => g.screenable).reduce((a, g) => a + g.expected, 0);

  // Cumulative coverage curve (SVG sparkline)
  const curve = useMemo(() => {
    let acc = 0;
    return genes.map((g) => (acc += g.expected) / (total || 1));
  }, [genes, total]);
  const W = 260;
  const H = 70;
  const pts = curve.map((v, i) => `${(i / Math.max(1, curve.length - 1)) * W},${H - v * H}`).join(" ");
  const kx = ((k - 1) / Math.max(1, curve.length - 1)) * W;

  return (
    <section className="card p-5 lg:p-6" aria-labelledby="panel-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            <TestTubes size={14} /> Action plan
          </div>
          <h3 id="panel-title" className="font-serif text-3xl leading-tight mt-1">
            Best {k}-gene diagnostic panel for {countryName}
          </h3>
          <p className="text-sm text-ink-2 mt-1 max-w-xl">
            Genes ranked by expected affected births per year. A ministry with budget for <strong>{k}</strong> genes would cover{" "}
            <span className="num font-semibold text-ink">{fmtPct(total ? covered / total : 0)}</span> of the modelled burden
            (<span className="num">{fmtCount(covered)}</span> of <span className="num">{fmtCount(total)}</span> births / yr).
          </p>
        </div>
        <svg width={W} height={H + 14} className="shrink-0" role="img" aria-label="Cumulative coverage curve">
          <polyline points={`0,${H} ${pts} ${W},${H}`} fill="#dff1e9" stroke="none" />
          <polyline points={pts} fill="none" stroke="#259978" strokeWidth={2} />
          <line x1={kx} x2={kx} y1={0} y2={H} stroke="#e0623a" strokeDasharray="3 3" />
          <text x={0} y={H + 12} fontSize={10} fill="#75817b">1 gene</text>
          <text x={W} y={H + 12} fontSize={10} fill="#75817b" textAnchor="end">{genes.length} genes</text>
        </svg>
      </div>

      <label className="mt-4 flex items-center gap-3 text-sm">
        <span className="text-ink-2 shrink-0">Panel size</span>
        <input
          type="range"
          min={1}
          max={Math.max(1, genes.length)}
          value={k}
          onChange={(e) => setK(Number(e.target.value))}
          className="w-full accent-[#259978]"
          aria-label="Number of genes in the panel"
        />
        <span className="num w-8 text-right font-semibold">{k}</span>
      </label>

      <ol className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {picked.map((g, i) => (
          <li key={g.gene} className="flex min-w-0 items-center gap-2 sm:gap-3 rounded-xl px-2 py-1.5 hover:bg-paper-2/60">
            <span className="num w-5 text-xs text-ink-3">{i + 1}</span>
            <span className="num w-14 shrink-0 font-semibold sm:w-16">{g.gene}</span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-xs text-ink-2">{g.diseaseName}</span>
              <span className="mt-0.5 block h-1.5 rounded-full bg-paper-2 overflow-hidden">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(g.expected / max) * 100}%` }} />
              </span>
            </span>
            <span className="num text-sm w-12 shrink-0 text-right">{fmtCount(g.expected)}</span>
            <span className="w-4 shrink-0 text-brand" title={g.screenable ? "Detectable by newborn screening" : undefined}>
              {g.screenable && <Baby size={14} aria-label="newborn-screenable" />}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ink-3">
        <Baby size={12} className="inline -mt-0.5" /> = detectable by standard newborn screening. Newborn screening for the screenable
        diseases alone would reach <span className="num font-semibold">{fmtCount(nbs)}</span> expected births / yr in {countryName}.
      </p>
    </section>
  );
}
