import { AlertTriangle, Dna, FlaskConical, Users, X } from "lucide-react";
import type { Atlas, CellView, DiseaseKey } from "../lib/types";
import { fmtCount, fmtOneIn, fmtPct, fmtRatio } from "../lib/format";
import { EvidenceCard, KindBadge, SourceLink } from "./Provenance";

const GROUP_LABEL: Record<string, string> = {
  afr: "African / African-American",
  amr: "Admixed American",
  asj: "Ashkenazi Jewish",
  eas: "East Asian",
  fin: "Finnish",
  mid: "Middle Eastern",
  nfe: "Non-Finnish European",
  sas: "South Asian",
};

interface Props {
  atlas: Atlas;
  cell: CellView;
  disease: DiseaseKey;
  onClose: () => void;
  onPickDisease: (id: string) => void;
}

export function CountryPanel({ atlas, cell, disease, onClose, onPickDisease }: Props) {
  const c = cell.country;
  const d = disease === "all" ? null : atlas.diseases.find((x) => x.id === disease) ?? null;
  const pair = d ? cell.pairs[0] : null;
  const fc = c.consanguinity.first_cousin_pct;
  const ov = c.consanguinity.overall_pct;
  const range = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}%` : `${r[0]}–${r[1]}%`);
  const lowAttention = cell.attention !== null && cell.attention < 0.5;

  return (
    <aside className="card rise p-5 lg:p-6 space-y-5" aria-label={`Evidence for ${c.name}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{d ? d.name : "All 22 modelled diseases"}</div>
          <h2 className="font-serif text-4xl leading-tight">{c.name}</h2>
        </div>
        <button onClick={onClose} className="rounded-full p-2 hover:bg-paper-2" aria-label="Close country panel">
          <X size={18} />
        </button>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-ink text-paper p-4 col-span-2 sm:col-span-1">
          <div className="text-xs uppercase tracking-wide text-paper/70">Expected affected births / year</div>
          <div className="num text-4xl font-semibold mt-1">{fmtCount(cell.expected.median)}</div>
          <div className="num text-xs text-paper/70 mt-1">
            90% interval {fmtCount(cell.expected.p5)} – {fmtCount(cell.expected.p95)}
            {disease === "all" && " (summed bounds)"}
          </div>
        </div>
        <div className="rounded-2xl p-4 col-span-2 sm:col-span-1" style={{ background: lowAttention ? "#fbe6dc" : "#dff1e9" }}>
          <div className="text-xs uppercase tracking-wide text-ink-2">Research attention vs burden</div>
          <div className="num text-4xl font-semibold mt-1" style={{ color: lowAttention ? "#b5441f" : "#0f5c46" }}>
            {fmtRatio(cell.attention)}
          </div>
          <div className="text-xs text-ink-2 mt-1">
            {cell.attention === null
              ? "Not enough data"
              : cell.attention < 1
                ? `${fmtRatio(1 / Math.max(cell.attention, 0.001))} less research per expected patient than average`
                : "Research matches or exceeds expected burden"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="risk per birth" value={fmtOneIn(cell.per100k.median)} />
        <Stat label="papers (title/abstract)" value={cell.papers.toLocaleString("en-US")} />
        <Stat label="open trials" value={cell.trials.toLocaleString("en-US")} />
      </div>

      {cell.consanguinityShare > 0.05 && (
        <p className="text-sm text-ink-2 leading-relaxed">
          <span className="font-semibold text-ink">{fmtPct(cell.consanguinityShare)}</span> of these expected births come from the
          inbreeding term (q·F): children of related parents inheriting the <em>same</em> rare allele twice. This is why national
          registries built on Western prevalence figures miss them.
        </p>
      )}

      {d?.caveat && (
        <div className="flex gap-2 rounded-2xl border border-amber/40 bg-[#fbf3e1] p-3 text-sm text-[#6b4706]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{d.caveat}</span>
        </div>
      )}

      {/* Evidence chain */}
      <div className="space-y-2.5">
        <h3 className="flex items-center gap-2 font-semibold">
          <FlaskConical size={16} className="text-brand" /> Evidence chain
        </h3>

        {d && pair && (
          <EvidenceCard title="Pathogenic allele frequency (gnomAD v4)" kind="observed">
            {pair.per_gene.map((g) => {
              const gd = d.genes_detail.find((x) => x.gene === g.gene);
              return (
                <div key={g.gene} className="mb-1.5">
                  <span className="num font-semibold">{g.gene}</span>: q ≈{" "}
                  <span className="num">{g.q.median.toExponential(2)}</span> from {gd?.n_qualifying ?? "?"} qualifying variants{" "}
                  (ClinVar P/LP ≥1★ or high-confidence LoF).{" "}
                  {gd && <SourceLink href={gd.url}>gnomAD {g.gene}</SourceLink>}
                </div>
              );
            })}
            <div className="text-ink-2">
              Carrier frequency ≈ <span className="num font-semibold text-ink">{fmtOneIn(pair.carrier_freq.median * 1e5)}</span> people.
            </div>
          </EvidenceCard>
        )}

        <EvidenceCard
          title="Consanguinity → inbreeding coefficient F"
          kind={c.consanguinity.first_cousin_kind === "literature" ? "literature" : "inferred"}
          source={c.consanguinity.source}
        >
          {fc ? `First-cousin marriages ${range(fc)}, all consanguineous ${range(ov)}.` : `Consanguineous marriages ${range(ov)} (first-cousin share inferred as 50–80%).`}{" "}
          Population mean F ≈ <span className="num font-semibold">{c.consanguinity.F.median.toFixed(4)}</span>{" "}
          <span className="text-ink-3 num">
            [{c.consanguinity.F.p5.toFixed(4)}–{c.consanguinity.F.p95.toFixed(4)}]
          </span>
        </EvidenceCard>

        <EvidenceCard title="Genetic ancestry mapping" kind="inferred">
          gnomAD groups people by genetic ancestry, not passport. We approximate {c.name} as{" "}
          {Object.entries(c.ancestry)
            .map(([g, w]) => `${Math.round(w * 100)}% ${GROUP_LABEL[g] ?? g}`)
            .join(" + ")}
          .
          {Object.keys(c.ancestry).includes("mid") && (
            <span className="block mt-1 text-ink-2">
              gnomAD's Middle Eastern group has only <span className="num">{fmtCount(atlas.meta.gnomad_alleles.mid / 2)}</span> people
              (vs <span className="num">{fmtCount(atlas.meta.gnomad_alleles.nfe / 2)}</span> Europeans) — local founder alleles are likely
              missed, so this estimate is probably <strong>too low</strong>.
            </span>
          )}
        </EvidenceCard>

        <EvidenceCard title="Births per year" kind="observed" source={{ label: `${c.births.source}, ${c.births.cbr_year}`, url: c.births.url }}>
          <span className="num font-semibold">{c.births.births_per_year.toLocaleString("en-US")}</span> births (crude birth rate{" "}
          {c.births.crude_birth_rate.toFixed(1)}‰ × population {c.births.population.toLocaleString("en-US")}).
        </EvidenceCard>

        {d && pair && (
          <EvidenceCard title="What the world has published & is testing" kind="observed">
            <div>
              <span className="num font-semibold">{pair.papers.papers}</span> papers mention {d.name} and {c.name} in their title or
              abstract. <SourceLink href={pair.papers.url}>Europe PMC query</SourceLink>
            </div>
            <div className="mt-1">
              <span className="num font-semibold">{pair.trials.open_trials}</span> recruiting / not-yet-recruiting trials with a site here.{" "}
              <SourceLink href={pair.trials.url}>ClinicalTrials.gov</SourceLink>
            </div>
          </EvidenceCard>
        )}
      </div>

      {/* Uncertainty */}
      {d && pair && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <Dna size={16} className="text-brand" /> What would change this estimate?
          </h3>
          <Bar label="Uncertainty from genetic data" value={pair.uncertainty.from_genetics} color="#259978" />
          <Bar label="Uncertainty from consanguinity data" value={pair.uncertainty.from_consanguinity} color="#c98a1b" />
          <p className="text-sm text-ink-2">
            Sequencing <strong>1,000 more people</strong> from {c.name}'s ancestry groups would narrow the interval by about{" "}
            <span className="num font-semibold text-ink">{fmtPct(Math.max(0, pair.uncertainty.narrowing_if_1000_sequenced))}</span>
            {pair.uncertainty.from_consanguinity > pair.uncertainty.from_genetics
              ? "; a fresh national consanguinity survey would help even more."
              : "."}
          </p>
        </div>
      )}

      {/* All-diseases breakdown */}
      {!d && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <Users size={16} className="text-brand" /> Where the hidden patients are
          </h3>
          <ul className="divide-y divide-line">
            {[...cell.pairs]
              .sort((a, b) => b.expected_births.median - a.expected_births.median)
              .slice(0, 10)
              .map((p) => {
                const dd = atlas.diseases.find((x) => x.id === p.disease)!;
                return (
                  <li key={p.disease}>
                    <button
                      onClick={() => onPickDisease(p.disease)}
                      className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-paper-2/60 rounded-lg px-1"
                    >
                      <span className="text-sm">{dd.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="num text-sm font-semibold">{fmtCount(p.expected_births.median)}/yr</span>
                        <span
                          className="num chip"
                          style={{
                            background: (p.attention_ratio ?? 0) < 0.5 ? "#fbe6dc" : "#dff1e9",
                            color: (p.attention_ratio ?? 0) < 0.5 ? "#b5441f" : "#0f5c46",
                          }}
                          title="Research attention vs burden"
                        >
                          {fmtRatio(p.attention_ratio)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1 text-xs text-ink-3">
        <KindBadge kind="observed" /> <KindBadge kind="literature" /> <KindBadge kind="inferred" /> <KindBadge kind="computed" />
        <span>Population-level estimates. Not medical advice.</span>
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-2 py-2.5">
      <div className="num text-base font-semibold">{value}</div>
      <div className="text-[0.7rem] text-ink-3 mt-0.5">{label}</div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div>
      <div className="flex justify-between text-xs text-ink-2">
        <span>{label}</span>
        <span className="num">{fmtPct(v)}</span>
      </div>
      <div className="h-2 rounded-full bg-paper-2 mt-1 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: color }} />
      </div>
    </div>
  );
}
