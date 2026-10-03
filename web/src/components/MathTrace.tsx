import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Calculator, X } from "lucide-react";
import type { Atlas, Pair } from "../lib/types";
import { fmtCount, fmtOneIn, fmtPct } from "../lib/format";
import { KindBadge, SourceLink } from "./Provenance";

const GROUP: Record<string, string> = {
  afr: "African", amr: "Admixed American", asj: "Ashkenazi", eas: "East Asian", fin: "Finnish",
  mid: "Middle Eastern", nfe: "European", sas: "South Asian",
};

/** Small numbers in scientific notation, the rest with separators. */
function sci(x: number, digits = 3): string {
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a < 0.001 || a >= 1e7) {
    const [m, e] = x.toExponential(digits - 1).split("e");
    return `${m}×10${superscript(e)}`;
  }
  if (a < 1) return x.toPrecision(digits);
  return x.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
const SUP: Record<string, string> = { "-": "⁻", "+": "", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const superscript = (s: string) => s.split("").map((c) => SUP[c] ?? c).join("");

function Step({ n, title, kind, children }: { n: number; title: string; kind: "observed" | "literature" | "inferred" | "computed"; children: React.ReactNode }) {
  return (
    <section className="relative border-l-2 border-line pb-6 pl-6 last:pb-0">
      <span className="num absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[0.7rem] text-paper">{n}</span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <KindBadge kind={kind} />
      </div>
      <div className="mt-2 space-y-2 text-sm text-ink-2">{children}</div>
    </section>
  );
}

const Eq = ({ children }: { children: React.ReactNode }) => (
  <div className="num overflow-x-auto rounded-xl bg-paper-2/80 px-3 py-2 text-[0.82rem] text-ink">{children}</div>
);

export function MathTrace({ atlas, pair, onClose }: { atlas: Atlas; pair: Pair; onClose: () => void }) {
  const d = atlas.diseases.find((x) => x.id === pair.disease)!;
  const c = atlas.countries.find((x) => x.iso3 === pair.country)!;
  const t = pair.trace;
  const F = t.F;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal to <body>: ancestors with CSS transforms (entrance animations) would otherwise trap position: fixed.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-ink/30 p-3 backdrop-blur-[2px] sm:p-8" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Full calculation" className="rise card w-full max-w-3xl p-5 shadow-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
              <Calculator size={14} /> Full calculation · method v{atlas.meta.method_version}
            </div>
            <h2 className="mt-1 font-display text-3xl font-semibold">{d.name} · {c.name}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-paper-2" aria-label="Close calculation">
            <X size={18} />
          </button>
        </div>

        <div className="mt-6">
          <Step n={1} title="How common are disease alleles here? (q)" kind="observed">
            <p>
              For each gene we add up the frequencies of every qualifying variant in each gnomAD v4 ancestry group (q̂ = Σ AC/AN),
              then mix the groups with {c.name}'s ancestry weights <KindBadge kind="inferred" />.
            </p>
            {t.genes.map((g) => (
              <div key={g.gene} className="overflow-x-auto">
                <table className="num w-full text-[0.8rem]">
                  <thead>
                    <tr className="text-left text-ink-3">
                      <th className="py-1 pr-3 font-normal">{g.gene} · group</th>
                      <th className="py-1 pr-3 font-normal">weight</th>
                      <th className="py-1 pr-3 font-normal">q̂</th>
                      <th className="py-1 pr-3 font-normal">people</th>
                      <th className="py-1 font-normal">weight × q̂</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.groups.map((x) => (
                      <tr key={x.group} className="border-t border-line">
                        <td className="py-1 pr-3">{GROUP[x.group] ?? x.group}</td>
                        <td className="py-1 pr-3">{x.weight}</td>
                        <td className="py-1 pr-3">{sci(x.q_hat)}</td>
                        <td className="py-1 pr-3">{fmtCount(x.n_alleles / 2)}</td>
                        <td className="py-1">{sci(x.contribution)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-ink/20 font-semibold text-ink">
                      <td className="py-1 pr-3" colSpan={4}>q ({g.gene})</td>
                      <td className="py-1">{sci(g.q)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
            <p className="text-xs text-ink-3">
              Qualifying = ClinVar pathogenic/likely pathogenic (≥1★, no conflicts) or rare high-confidence loss-of-function; low-penetrance alleles excluded.
            </p>
          </Step>

          <Step n={2} title="How often are parents related? (F)" kind={c.consanguinity.first_cousin_kind === "literature" ? "literature" : "inferred"}>
            <Eq>
              F = {F.first_cousin_pct.toFixed(1)}% first cousins × 1/16 + {F.other_pct.toFixed(1)}% other consanguineous × 1/64 = <b>{F.F.toFixed(5)}</b>
            </Eq>
            {F.assumed_first_cousin_share !== null && (
              <p className="text-xs">The source gives only the overall rate; the first-cousin share is assumed to be {fmtPct(F.assumed_first_cousin_share)} (range 50–80%).</p>
            )}
            <p className="text-xs">
              Midpoints of the reported ranges. Source: <SourceLink href={c.consanguinity.source.url}>{c.consanguinity.source.label}</SourceLink>
            </p>
          </Step>

          <Step n={3} title="Risk that a child is affected (P)" kind="computed">
            <p>Wright's formula: random pairing of two disease alleles, plus the same allele inherited twice from a shared ancestor.</p>
            {t.genes.map((g) => (
              <Eq key={g.gene}>
                {g.gene}: q²(1−F) + q·F = {sci(g.hw_term)} + <span className="text-unseen">{sci(g.ibd_term)}</span> = <b>{sci(g.P)}</b>
              </Eq>
            ))}
            <Eq>
              P = <b>{sci(t.P)}</b> ≈ {fmtOneIn(t.P * 1e5)} births ·{" "}
              <span className="text-unseen">{fmtPct(t.genes.reduce((a, g) => a + g.ibd_term, 0) / t.P)} from related parents</span>
            </Eq>
          </Step>

          <Step n={4} title="Expected affected births per year" kind="observed">
            <Eq>
              {sci(t.P)} × {t.births.toLocaleString("en-US")} births = <b>{fmtCount(t.expected)}</b> per year
            </Eq>
            <p className="text-xs">
              Births = crude birth rate × population. <SourceLink href={c.births.url}>{c.births.source}, {c.births.cbr_year}</SourceLink>
            </p>
          </Step>

          <Step n={5} title="Uncertainty (Monte Carlo)" kind="computed">
            <p>
              {t.mc.samples.toLocaleString()} draws: q from a Jeffreys Beta posterior on each group's allele count, F uniformly across the
              survey ranges. Every number in UNSEEN is a range.
            </p>
            <Eq>
              median <b>{fmtCount(t.mc.median)}</b> · 90% interval {fmtCount(t.mc.p5)} – {fmtCount(t.mc.p95)} · point estimate {fmtCount(t.expected)}
            </Eq>
            <p className="text-xs">
              If consanguinity were known exactly, {fmtPct(Math.min(1, pair.uncertainty.from_genetics))} of the interval would remain (genetic
              uncertainty alone); if allele frequencies were known exactly, {fmtPct(Math.min(1, pair.uncertainty.from_consanguinity))} would remain.
              Sequencing 1,000 more people would narrow it by {fmtPct(Math.max(0, pair.uncertainty.narrowing_if_1000_sequenced))}.
            </p>
          </Step>

          {t.attention && (
            <Step n={6} title="Is anyone looking? (research attention)" kind="observed">
              <Eq>
                share of papers {t.attention.papers}/{t.attention.papers_total} = {fmtPct(t.attention.share_papers, 1)} ÷ share of expected
                births {fmtPct(t.attention.share_expected, 1)} = <b>{pair.attention_ratio === null ? "—" : `${pair.attention_ratio.toFixed(2)}×`}</b>
              </Eq>
              <p className="text-xs">Shares across the 18 modelled countries for this disease. 1× = research matches burden.</p>
            </Step>
          )}

          {pair.regional && (
            <Step n={7} title={`Cross-check with regional genomes (${pair.regional.label})`} kind="observed">
              <p>
                {pair.regional.people} unrelated exomes from the GME Variome. We treat our ancestry-mix estimate as a prior worth{" "}
                {pair.regional.prior_alleles.toLocaleString()} alleles <KindBadge kind="inferred" /> and update it with the regional counts:
              </p>
              {pair.regional.genes.map((g) => (
                <Eq key={g.gene}>
                  {g.gene}: mean q<sub>post</sub> = ({pair.regional!.prior_alleles} × {sci(g.q_proxy)} + {sci(g.q_gme)} × {g.alleles}) ÷ ({pair.regional!.prior_alleles} + {g.alleles}) ={" "}
                  <b>{sci((pair.regional!.prior_alleles * g.q_proxy + g.q_gme * g.alleles) / (pair.regional!.prior_alleles + g.alleles))}</b>
                  <span className="text-ink-3"> · simulation median {sci(g.q_posterior)}</span>
                </Eq>
              ))}
              <Eq>
                expected with regional genomes: <b>{fmtCount(pair.regional.expected_births.median)}</b> per year (90% {fmtCount(pair.regional.expected_births.p5)} – {fmtCount(pair.regional.expected_births.p95)})
              </Eq>
            </Step>
          )}

          {pair.reported.best && (
            <Step n={pair.regional ? 8 : 7} title="How many have actually been reported?" kind="observed">
              <blockquote className="border-l-2 border-brand/50 pl-3 text-xs italic">"{pair.reported.best.sentence}"</blockquote>
              <Eq>
                {pair.reported.best.n} {pair.reported.best.unit} ÷ {fmtCount(pair.expected_births.median)} expected per year ={" "}
                <b>{pair.reported.years_of_expected?.toFixed(2)} years</b> of expected births in the largest published series
              </Eq>
              {pair.reported.best.url && <SourceLink href={pair.reported.best.url}>PMID {pair.reported.best.pmid} ({pair.reported.best.year})</SourceLink>}
            </Step>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
