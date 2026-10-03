import { CheckCircle2, Database, FlaskConical, Scale, ShieldAlert } from "lucide-react";
import type { Atlas, Pair } from "../lib/types";
import { fmtDate, fmtOneIn } from "../lib/format";
import { KindBadge, SourceLink } from "./Provenance";

const DATA_SOURCES = [
  { name: "gnomAD v4.1 (joint exomes + genomes)", what: "Per-ancestry allele counts for every variant", url: "https://gnomad.broadinstitute.org", kind: "observed" as const },
  { name: "ClinVar (via gnomAD overlay)", what: "Which variants are pathogenic, with review stars", url: "https://www.ncbi.nlm.nih.gov/clinvar/", kind: "observed" as const },
  { name: "Orphanet / ORPHAcodes API", what: "Disease identity (every ORPHA code verified)", url: "https://www.orpha.net", kind: "observed" as const },
  { name: "World Bank WDI", what: "Crude birth rate × population → births per year", url: "https://data.worldbank.org", kind: "observed" as const },
  { name: "Europe PMC REST API", what: "Papers mentioning disease + country in title/abstract", url: "https://europepmc.org", kind: "observed" as const },
  { name: "ClinicalTrials.gov API v2", what: "Recruiting / not-yet-recruiting trials by site country", url: "https://clinicaltrials.gov", kind: "observed" as const },
  { name: "Tadmouri et al. 2009 · Saadat 2004 · Pakistan DHS 2017-18 · Turkish DHS · NFHS (India) · Bittles & Black 2010", what: "Consanguineous-marriage rates", url: "https://doi.org/10.1186/1742-4755-6-17", kind: "literature" as const },
];

export function MethodPage({ atlas, index }: { atlas: Atlas; index: Map<string, Pair> }) {
  const rows = atlas.validation.flatMap((v) => {
    const p = index.get(`${v.disease}|${v.country}`);
    const d = atlas.diseases.find((x) => x.id === v.disease);
    const c = atlas.countries.find((x) => x.iso3 === v.country);
    if (!p || !d || !c) return [];
    const expectedOneIn = 1e5 / p.per_100k.median;
    const mid = Math.sqrt(v.observed_one_in[0] * v.observed_one_in[1]);
    return [{ key: `${v.disease}|${v.country}`, name: d.name, country: c.name, v, expectedOneIn, ratio: mid / expectedOneIn }];
  });
  const lowPen = Object.entries(atlas.meta.low_penetrance_excluded).flatMap(([g, vs]) => Object.entries(vs).map(([h, why]) => ({ g, h, why })));
  const curated = Object.entries(atlas.meta.curated_pathogenic).flatMap(([g, vs]) => Object.entries(vs).map(([h, why]) => ({ g, h, why })));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="rise">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">Method · v{atlas.meta.method_version}</div>
        <h1 className="mt-2 font-serif text-5xl leading-[1.05]">How UNSEEN counts the patients nobody has counted</h1>
        <p className="mt-3 max-w-3xl text-lg text-ink-2">
          Registries count diagnosed patients. Where there are few geneticists there are few diagnoses, so the registry says "no
          disease", so nobody funds tests. UNSEEN breaks that loop by asking population genetics how many affected children{" "}
          <em>should</em> be born, and comparing that to how much the world is looking.
        </p>
      </header>

      <section className="card p-6 space-y-4">
        <h2 className="flex items-center gap-2 font-serif text-3xl"><FlaskConical className="text-brand" /> The formula</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Formula title="1 · Pathogenic allele frequency" body="q = Σ AC / AN over qualifying variants, per gnomAD ancestry group, mixed by the country's ancestry weights." />
          <Formula title="2 · Inbreeding coefficient" body="F = (first-cousin share) × 1/16 + (other consanguineous) × 1/64, from national surveys." />
          <Formula title="3 · Affected births" body="P = q²(1 − F) + q·F   →   expected = P × births per year." />
        </div>
        <p className="text-sm text-ink-2">
          q·F is the key term: in a related couple a child can inherit the <em>same</em> rare allele twice from a shared ancestor. For a
          rare allele (q = 0.001) first-cousin parents raise the risk ~63×. Uncertainty is propagated with {atlas.meta.mc_samples.toLocaleString()}{" "}
          Monte-Carlo draws: Jeffreys Beta posteriors on q (so a population where gnomAD saw nothing still gets an honest upper bound) and
          uniform draws across each survey's reported consanguinity range. Diseases with several genes sum per-gene risks.
        </p>
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          <div className="rounded-2xl border border-line p-4">
            <div className="font-semibold">A variant qualifies if…</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-2">
              <li>ClinVar Pathogenic / Likely pathogenic with ≥1 review star and no conflicts, <strong>or</strong></li>
              <li>it is a high-confidence loss-of-function call with no ClinVar record, rarer than {atlas.meta.max_unclassified_lof_af * 100}% in every group (artefact guard);</li>
              <li>it passes gnomAD filters and its overall frequency is ≤ {atlas.meta.max_variant_af * 100}%.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <div className="font-semibold">Deliberate overrides <KindBadge kind="curated" /></div>
            <ul className="mt-1.5 space-y-1 text-ink-2">
              {lowPen.map((x) => (
                <li key={x.h}><span className="num text-ink">{x.g} {x.h}</span> excluded: {x.why}</li>
              ))}
              {curated.map((x) => (
                <li key={x.h}><span className="num text-ink">{x.g} {x.h}</span> included: {x.why}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="flex items-center gap-2 font-serif text-3xl"><CheckCircle2 className="text-brand" /> Does it work? Validation where screening is universal</h2>
        <p className="text-sm text-ink-2">
          Where every newborn is screened, observed incidence is close to the truth, so expected and observed should match. We test a
          low-consanguinity country (Germany) and two high-consanguinity ones (Turkey, Iran), and we show the misses too.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-3">
                <th className="py-2 pr-3">Disease · country</th>
                <th className="py-2 pr-3">Observed (screening)</th>
                <th className="py-2 pr-3">UNSEEN expected</th>
                <th className="py-2 pr-3">Agreement</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-line align-top">
                  <td className="py-2.5 pr-3 font-medium">
                    {r.name} · {r.country}
                    {r.v.note && <div className="text-xs font-normal text-ink-3 max-w-sm">{r.v.note}</div>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="num">
                      1 in {r.v.observed_one_in[0].toLocaleString("en-US")}
                      {r.v.observed_one_in[1] !== r.v.observed_one_in[0] && `–${r.v.observed_one_in[1].toLocaleString("en-US")}`}
                    </span>
                    <div className="text-xs text-ink-3">
                      {r.v.label} · <SourceLink href={r.v.source.url}>{r.v.source.label}</SourceLink>
                    </div>
                  </td>
                  <td className="num py-2.5 pr-3">{fmtOneIn(1e5 / r.expectedOneIn)}</td>
                  <td className="py-2.5 pr-3">
                    <span
                      className="chip num"
                      style={
                        r.ratio > 0.5 && r.ratio < 2
                          ? { background: "#dff1e9", color: "#0f5c46" }
                          : { background: "#f8ecd2", color: "#8a5a07" }
                      }
                    >
                      {r.ratio >= 1 ? `model ${r.ratio.toFixed(2)}× higher` : `model ${(1 / r.ratio).toFixed(2)}× lower`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="flex items-center gap-2 font-serif text-3xl"><Database className="text-brand" /> Data sources</h2>
        <ul className="divide-y divide-line">
          {DATA_SOURCES.map((s) => (
            <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span>
                <SourceLink href={s.url}>{s.name}</SourceLink>
                <span className="block text-ink-3">{s.what}</span>
              </span>
              <KindBadge kind={s.kind} />
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-3">
          Genetic data retrieved {fmtDate(atlas.diseases[0].genes_detail[0].retrieved_at)} · context retrieved{" "}
          {fmtDate(atlas.meta.context_retrieved_at)} · computed {fmtDate(atlas.meta.computed_at)}. Everything is cached, so the atlas runs
          offline and is fully reproducible from the open pipeline.
        </p>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="flex items-center gap-2 font-serif text-3xl"><Scale className="text-brand" /> Honest limits</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>
            <strong>Under-representation.</strong> gnomAD's Middle Eastern group has ~{Math.round(atlas.meta.gnomad_alleles.mid / 2).toLocaleString()} people
            versus ~{Math.round(atlas.meta.gnomad_alleles.nfe / 2).toLocaleString()} Europeans, and ClinVar is biased toward variants seen in
            Europeans. Local founder alleles are missed, so estimates for under-studied populations are mostly <em>too low</em>: the
            real gap is probably larger.
          </li>
          <li><strong>Ancestry ≠ country.</strong> Country ancestry weights are stated approximations <KindBadge kind="inferred" />.</li>
          <li><strong>Penetrance and survival.</strong> We estimate affected <em>births</em>, not living patients; penetrance is assumed complete.</li>
          <li><strong>Research attention is a proxy.</strong> Paper counts measure how much the world is looking, not how many patients are diagnosed.</li>
          <li><strong>Scope.</strong> Autosomal-recessive diseases with SNV/indel causes only. These are deliberately excluded:</li>
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          {atlas.excluded.map((e) => (
            <div key={e.name} className="rounded-2xl border border-line p-3 text-sm">
              <div className="font-medium">{e.name} <span className="num text-xs text-ink-3">{e.genes.join(", ")}</span></div>
              <div className="text-ink-3 text-xs mt-0.5">{e.reason}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6 space-y-2">
        <h2 className="flex items-center gap-2 font-serif text-3xl"><ShieldAlert className="text-brand" /> Ethics</h2>
        <p className="text-sm text-ink-2">
          Consanguineous marriage is a long-standing cultural practice, not a moral failing. UNSEEN uses it only to bring diagnostic
          services <em>to</em> communities that have been left out. All estimates are population-level: no personal data, no individual
          risk, no medical advice. The AI layer can only rephrase verified facts and refuses individual medical questions.
        </p>
      </section>
    </div>
  );
}

function Formula({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-paper-2/70 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</div>
      <div className="num mt-2 text-sm leading-relaxed">{body}</div>
    </div>
  );
}
