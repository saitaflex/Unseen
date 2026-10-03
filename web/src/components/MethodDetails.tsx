import { Bot, Globe2, Sigma } from "lucide-react";
import type { Atlas, Pair } from "../lib/types";
import { fmtCount } from "../lib/format";
import { KindBadge, SourceLink } from "./Provenance";

const F = ({ children }: { children: React.ReactNode }) => (
  <div className="num overflow-x-auto rounded-xl bg-paper-2/80 px-3 py-2 text-[0.82rem] text-ink">{children}</div>
);

function Row({ n, title, formula, note }: { n: number; title: string; formula: React.ReactNode; note: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-line py-4 first:border-t-0 md:grid-cols-[13rem_1fr]">
      <div className="font-display font-semibold">
        <span className="num mr-2 text-ink-3">{String(n).padStart(2, "0")}</span>
        {title}
      </div>
      <div className="space-y-1.5">
        <F>{formula}</F>
        <p className="text-sm text-ink-2">{note}</p>
      </div>
    </div>
  );
}

export function MethodDetails({ atlas, index }: { atlas: Atlas; index: Map<string, Pair> }) {
  const m = atlas.meta;
  const tur = index.get("pku|TUR");
  const irn = index.get("pku|IRN");
  return (
    <>
      <section className="card space-y-1 p-6">
        <h2 className="flex items-center gap-2 font-display text-3xl font-semibold">
          <Sigma className="text-brand" /> Every calculation, in detail
        </h2>
        <p className="pb-2 text-sm text-ink-3">Each one is open in the app: click a country, then "Show the full calculation".</p>
        <Row n={1} title="Allele frequency" formula={<>q̂<sub>gene,group</sub> = Σ<sub>variants</sub> AC / AN</>}
          note="Summed over qualifying variants in each gnomAD v4 ancestry group (joint exomes + genomes)." />
        <Row n={2} title="Sampling uncertainty" formula={<>q ~ Beta(x + ½, n − x + ½),  x = q̂·n,  n = alleles sampled in the group</>}
          note="Jeffreys posterior on the pooled allele count, so a group where gnomAD saw nothing still gets an honest upper bound instead of zero." />
        <Row n={3} title="Country mix" formula={<>q<sub>country</sub> = Σ<sub>groups</sub> w<sub>group</sub> · q<sub>group</sub></>}
          note={<>Ancestry weights per country are stated approximations <KindBadge kind="inferred" />, cross-checked against regional genomes (17 below).</>} />
        <Row n={4} title="Inbreeding coefficient" formula={<>F = r<sub>1st cousin</sub> × 1/16 + (r<sub>all</sub> − r<sub>1st cousin</sub>) × 1/64</>}
          note="r drawn uniformly from each survey's reported range, with r_all ≥ r_1st cousin. If a survey gives only r_all, the first-cousin share is drawn from 50–80% (stated as inferred)." />
        <Row n={5} title="Risk per birth" formula={<>P = Σ<sub>genes</sub> [ q²(1 − F) + q·F ]</>}
          note="Wright's formula. The q·F term is identity by descent: a child of related parents inheriting the same rare allele twice. Genes of one disease add up (compound heterozygotes across genes are negligible)." />
        <Row n={6} title="Expected births" formula={<>E = P × B,  B = crude birth rate / 1000 × population</>} note="World Bank WDI, most recent year." />
        <Row n={7} title="Monte Carlo" formula={<>{m.mc_samples.toLocaleString()} joint draws of (q, F) → median, 5th and 95th percentiles of E</>}
          note="Fixed random seed; CI checks that the published CSV rebuilds byte-for-byte." />
        <Row n={8} title="What drives the uncertainty" formula={<>left<sub>genetics</sub> = width(E | F fixed at median) ÷ width(E)</>}
          note="The share of the interval that remains when consanguinity is known exactly (and vice versa with q fixed). Width = 95th − 5th percentile; the two are not shares of a whole." />
        <Row n={9} title="Value of more data" formula={<>narrowing = 1 − width(E | n + {m.extra_alleles.toLocaleString()}·w) ÷ width(E)</>}
          note="What sequencing 1,000 more people from the country's ancestry groups would buy, so funders can see where data pays off." />
        <Row n={10} title="Research attention" formula={<>A = (papers<sub>c</sub> / Σ papers) ÷ (E<sub>c</sub> / Σ E)</>}
          note="Europe PMC title/abstract counts with disease synonyms and country demonyms. A < 1: fewer papers than the burden predicts." />
        <Row n={11} title="Most unseen" formula={<>U = E ÷ max(A, 0.02)</>} note="Ranks large expected burden combined with little research." />
        <Row n={12} title="Reported patients" formula={<>years of expected births = largest published series ÷ E</>}
          note={<>Text-mined from up to 300 abstracts per pair: the count must sit in a phrase naming the disease ("48 children with Wilson disease"), the sentence or title must name the country, and screened/suspected/control groups are rejected. It is one study, so a lower bound: always shown with its verbatim sentence and PMID. GJB2 is excluded (deafness cohorts mix causes).</>} />
        <Row n={13} title="Screening gap" formula={<>gap = Σ E over blood-spot-detectable diseases not on the national panel</>}
          note={<>Programmes from cited national sources; countries where no programme was found are labelled <KindBadge kind="inferred" />.</>} />
        <Row n={14} title="Screening economics" formula={<>cost = B × ${m.costs.test_usd[0]}–{m.costs.test_usd[1]};  savings = cases × ${m.costs.saving_per_case_usd.toLocaleString()};  ratio = savings ÷ cost</>}
          note={<>Test price is an assumed range <KindBadge kind="inferred" />; saving per case from <SourceLink href={m.costs.saving_src.url}>Khneisser et al. 2015 (Lebanon)</SourceLink>.</>} />
        <Row n={15} title="Panel optimiser" formula={<>best k genes = top-k of E<sub>gene</sub> (contributions are additive, so greedy is optimal)</>} note="Coverage = Σ top-k ÷ Σ all genes." />
        <Row n={16} title="Validation" formula={<>ratio = observed incidence ÷ modelled incidence</>} note="Against countries that screen every newborn; misses are shown, not hidden." />
        <Row n={17} title="Regional genomes (Bayesian)" formula={<>q<sub>post</sub> ~ Beta(n₀·q + x + ½, n₀(1 − q) + n − x + ½),  n₀ = {m.gme.prior_alleles},  n = 2 × people,  x = q<sub>GME</sub>·n</>}
          note={<>Our ancestry-mix estimate acts as a prior worth {m.gme.prior_alleles} alleles <KindBadge kind="inferred" />; the GME Variome's exomes update it.</>} />
      </section>

      <section className="card space-y-3 p-6">
        <h2 className="flex items-center gap-2 font-display text-3xl font-semibold">
          <Globe2 className="text-brand" /> What regional genomes taught us
        </h2>
        <p className="text-sm text-ink-2">
          The GME Variome (<SourceLink href={m.gme.source.url}>Scott et al. 2016</SourceLink>) sequenced 1,111 unrelated people across six subregions:
          "{m.gme.source.quote}". We matched every ClinVar pathogenic variant (including ones gnomAD never saw) against it.
        </p>
        {tur?.regional && irn?.regional && (
          <p className="text-sm text-ink-2">
            For PKU, regional genomes give <strong>higher</strong> allele frequencies, not lower: Turkey {fmtCount(tur.expected_births.median)} →{" "}
            {fmtCount(tur.regional.expected_births.median)} expected births a year, Iran {fmtCount(irn.expected_births.median)} →{" "}
            {fmtCount(irn.regional.expected_births.median)}. So the model's PKU overestimate there is <em>not</em> an ancestry error. The likely
            cause is mild hyperphenylalaninemia alleles (e.g. A300S, V230I) that national programmes classify differently. That makes the
            next research step concrete: severity-aware variant classification.
          </p>
        )}
        <p className="text-xs text-ink-3">The regional samples are small (81–423 people), so the main map keeps the gnomAD estimate and shows the regional one beside it.</p>
      </section>

      <section className="card space-y-3 p-6">
        <h2 className="flex items-center gap-2 font-display text-3xl font-semibold">
          <Bot className="text-brand" /> The AI, and why it can't make numbers up
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-line p-4 text-sm text-ink-2">
            <div className="font-display text-lg font-semibold text-ink">Ask the Atlas: a tool-calling agent</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>An OpenAI model reads the atlas only through 7 typed tools (estimate, full calculation, rankings, country profile, panel, compare, disease list).</li>
              <li>A <strong>number verifier</strong> checks every number in its answer against the tool outputs. If anything is untraceable, the model must rewrite; if it still fails, the verified offline answer is shown instead.</li>
              <li>Medical-advice questions are refused before any model call.</li>
              <li>The whole loop is tested against a simulated model, including hallucinated numbers.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-line p-4 text-sm text-ink-2">
            <div className="font-display text-lg font-semibold text-ink">The evidence agent: reads the literature</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Searches Europe PMC, reads open-access full texts, and records founder variants, allele frequencies and patient series.</li>
              <li>A finding is kept only if its quote appears <strong>verbatim</strong> in text the agent actually retrieved, and the number appears inside the quote.</li>
              <li>
                Status:{" "}
                {m.agent.generated_at
                  ? `${m.agent.verified} verified, ${m.agent.rejected} rejected (${m.agent.model}).`
                  : "ready; runs with an OpenAI key (python pipeline/evidence_agent.py)."}
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
