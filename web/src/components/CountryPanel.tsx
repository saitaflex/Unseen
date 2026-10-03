import { useState } from "react";
import { AlertTriangle, BadgeCheck, Baby, Calculator, Coins, Dna, FlaskConical, Globe2, LifeBuoy, ScrollText, Users, X } from "lucide-react";
import type { Atlas, CellView, DiseaseKey } from "../lib/types";
import { fmtCount, fmtOneIn, fmtPct, fmtRatio } from "../lib/format";
import { EvidenceCard, KindBadge, SourceLink } from "./Provenance";
import { MathTrace } from "./MathTrace";

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
  const [showMath, setShowMath] = useState(() => new URLSearchParams(window.location.search).get("calc") === "1");
  const usd = (x: number) => (x >= 1e9 ? `$${(x / 1e9).toFixed(1)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${Math.round(x / 1000)}k`);

  return (
    <aside className="card rise p-5 lg:p-6 space-y-5" aria-label={`Evidence for ${c.name}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{d ? d.name : "All 22 modelled diseases"}</div>
          <h2 className="font-display text-4xl leading-tight">{c.name}</h2>
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
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-unseen">{fmtPct(cell.consanguinityShare)}</span> come from related parents (the q·F
          term), a group Western prevalence figures miss.
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
          Approximated as{" "}
          {Object.entries(c.ancestry)
            .map(([g, w]) => `${Math.round(w * 100)}% ${GROUP_LABEL[g] ?? g}`)
            .join(" + ")}
          .
          {Object.keys(c.ancestry).includes("mid") && (
            <span className="block mt-1 text-ink-2">
              Only <span className="num">{fmtCount(atlas.meta.gnomad_alleles.mid / 2)}</span> Middle-Eastern genomes in gnomAD, so this is
              probably <strong>too low</strong>.
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

      {d && pair && (
        <button
          onClick={() => setShowMath(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-ink/15 bg-paper-2/60 px-4 py-3 text-sm font-medium hover:border-brand/50"
        >
          <Calculator size={16} className="text-brand" /> Show the full calculation, step by step
        </button>
      )}
      {showMath && pair && <MathTrace atlas={atlas} pair={pair} onClose={() => setShowMath(false)} />}

      {d && pair && (
        <div className="space-y-2.5">
          <h3 className="flex items-center gap-2 font-semibold">
            <ScrollText size={16} className="text-brand" /> Diagnosed so far
          </h3>
          {pair.reported.best ? (
            <EvidenceCard
              title="Largest published patient series (text-mined)"
              kind="observed"
              source={pair.reported.best.url ? { label: `PMID ${pair.reported.best.pmid} · ${pair.reported.best.year}`, url: pair.reported.best.url } : undefined}
            >
              <span className="num font-semibold">{pair.reported.best.n} {pair.reported.best.unit}</span>
              {pair.reported.years_of_expected !== null && (
                <>
                  {" "}={" "}
                  <span className="num font-semibold text-unseen">
                    {pair.reported.years_of_expected < 1
                      ? `${Math.max(1, Math.round(pair.reported.years_of_expected * 12))} month${Math.round(pair.reported.years_of_expected * 12) === 1 ? "" : "s"}`
                      : `${pair.reported.years_of_expected.toFixed(1)} years`}
                  </span>{" "}
                  of expected births.
                </>
              )}
              <blockquote className="mt-1.5 border-l-2 border-line pl-2 text-xs italic text-ink-3">"{pair.reported.best.sentence}"</blockquote>
            </EvidenceCard>
          ) : (
            <EvidenceCard title="Largest published patient series" kind="observed">
              No patient count found in {pair.reported.abstracts_scanned} abstracts
              {pair.reported.abstracts_scanned === 0 ? " (no papers at all)" : " that name this disease and country"}. An evidence desert.
            </EvidenceCard>
          )}
          {pair.evidence.length > 0 && (
            <EvidenceCard title={`AI evidence agent · ${pair.evidence.length} verified finding${pair.evidence.length > 1 ? "s" : ""}`} kind="literature">
              <ul className="space-y-1.5">
                {pair.evidence.map((f, i) => (
                  <li key={i}>
                    <span className="num font-semibold">
                      {f.value} {f.unit}
                    </span>
                    {f.variant ? ` · ${f.variant}` : ""}{" "}
                    <span className="chip" style={{ background: "#dff1e9", color: "#0f5c46" }}>
                      <BadgeCheck size={11} /> quote verified
                    </span>
                    <div className="text-xs italic text-ink-3">
                      "{f.quote}" <SourceLink href={f.url}>PMID {f.pmid}</SourceLink>
                    </div>
                  </li>
                ))}
              </ul>
            </EvidenceCard>
          )}

          <h3 className="flex items-center gap-2 pt-2 font-semibold">
            <Baby size={16} className="text-brand" /> Newborn screening
          </h3>
          <EvidenceCard title={c.screening.status} kind={c.screening.kind === "literature" ? "literature" : "inferred"} source={c.screening.src}>
            {!pair.screening.bloodspot ? (
              "Not detectable by standard blood-spot screening."
            ) : pair.screening.covered ? (
              <>
                Screened nationally: about <span className="num font-semibold">{fmtCount(pair.expected_births.median)}</span> affected babies a year can
                be found at birth.
              </>
            ) : (
              <>
                Not screened: about <span className="num font-semibold text-unseen">{fmtCount(pair.expected_births.median)}</span> treatable babies a
                year are born without a test that exists.
              </>
            )}
          </EvidenceCard>

          {pair.regional && (
            <>
              <h3 className="flex items-center gap-2 pt-2 font-semibold">
                <Globe2 size={16} className="text-brand" /> Regional genomes cross-check
              </h3>
              <EvidenceCard
                title={`GME Variome · ${pair.regional.label} · ${pair.regional.people} people`}
                kind="observed"
                source={{ label: atlas.meta.gme.source.label, url: atlas.meta.gme.source.url }}
              >
                {pair.regional.genes.map((g) => (
                  <div key={g.gene} className="num text-xs">
                    {g.gene}: ancestry mix q {g.q_proxy.toExponential(2)} · regional q {g.q_gme.toExponential(2)}
                  </div>
                ))}
                <div className="mt-1">
                  With regional data: <span className="num font-semibold">{fmtCount(pair.regional.expected_births.median)}</span>/yr
                  <span className="num text-ink-3">
                    {" "}({fmtCount(pair.regional.expected_births.p5)}–{fmtCount(pair.regional.expected_births.p95)})
                  </span>{" "}
                  vs <span className="num">{fmtCount(pair.expected_births.median)}</span> main estimate.
                </div>
              </EvidenceCard>
            </>
          )}

          <h3 className="flex items-center gap-2 pt-2 font-semibold">
            <LifeBuoy size={16} className="text-brand" /> Find help
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { l: "Orphanet: expert centres & patient groups", u: d.orphanet.url },
              { l: "Recruiting trials", u: pair.trials.url },
              { l: `Genetic tests for ${d.genes.join(", ")} (NCBI GTR)`, u: `https://www.ncbi.nlm.nih.gov/gtr/all/tests/?term=${encodeURIComponent(d.genes[0])}` },
              { l: "Published research", u: pair.papers.url },
            ].map((x) => (
              <a key={x.l} href={x.u} target="_blank" rel="noreferrer" className="rounded-xl border border-line px-3 py-2 text-xs hover:border-brand/50">
                {x.l} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      {!d && (
        <div className="space-y-2.5">
          <h3 className="flex items-center gap-2 font-semibold">
            <Baby size={16} className="text-brand" /> Newborn screening gap
          </h3>
          <EvidenceCard title={c.screening.status} kind={c.screening.kind === "literature" ? "literature" : "inferred"} source={c.screening.src}>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-brand-soft p-2">
                <div className="num text-xl font-semibold text-brand-deep">{fmtCount(c.screening_gap.covered_births)}</div>
                <div className="text-[0.7rem]">found at birth / yr</div>
              </div>
              <div className="rounded-xl bg-unseen-soft p-2">
                <div className="num text-xl font-semibold text-unseen">{fmtCount(c.screening_gap.missed_births)}</div>
                <div className="text-[0.7rem]">treatable, not screened / yr</div>
              </div>
            </div>
          </EvidenceCard>
          <EvidenceCard title="What full blood-spot screening would cost and save" kind="computed" source={atlas.meta.costs.saving_src}>
            <div className="flex items-start gap-2">
              <Coins size={16} className="mt-0.5 shrink-0 text-amber" />
              <div>
                Testing all <span className="num">{fmtCount(c.births.births_per_year)}</span> newborns at ${atlas.meta.costs.test_usd[0]}–
                {atlas.meta.costs.test_usd[1]} each <KindBadge kind="inferred" /> costs{" "}
                <span className="num font-semibold">
                  {usd(c.economics.annual_cost_usd[0])}–{usd(c.economics.annual_cost_usd[1])}
                </span>{" "}
                a year and would find about <span className="num font-semibold">{fmtCount(c.economics.cases_per_year)}</span> children. At the Lebanese
                figure of ${atlas.meta.costs.saving_per_case_usd.toLocaleString()} saved per case, that is{" "}
                <span className="num font-semibold text-brand-deep">{usd(c.economics.savings_usd)}</span> a year: a benefit–cost ratio of{" "}
                <span className="num font-semibold">
                  {c.economics.benefit_cost_ratio[0].toFixed(1)}–{c.economics.benefit_cost_ratio[1].toFixed(1)}×
                </span>
                .
              </div>
            </div>
          </EvidenceCard>
        </div>
      )}

      {/* Uncertainty */}
      {d && pair && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <Dna size={16} className="text-brand" /> What would change this estimate?
          </h3>
          <Bar label="Interval left from genetic data alone" value={pair.uncertainty.from_genetics} color="#259978" />
          <Bar label="Interval left from consanguinity data alone" value={pair.uncertainty.from_consanguinity} color="#c98a1b" />
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
