/**
 * Agent tools: the only way the AI can read the atlas. Pure functions over atlas.json, shared by the
 * OpenAI agent (api/agent.ts) and the offline engine, so both answer from exactly the same numbers.
 * Every result carries `sources` so answers can cite them.
 */
import type { Atlas, Pair } from "./types";

export interface ToolSource {
  label: string;
  url: string;
}
export interface ToolResult {
  ok: boolean;
  error?: string;
  data?: unknown;
  sources?: ToolSource[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9؀-ۿ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const COUNTRY_ALIASES: Record<string, string[]> = {
  TUN: ["tunisia", "tunisie", "تونس"], MAR: ["morocco", "maroc", "المغرب"], DZA: ["algeria", "algerie", "الجزائر"],
  LBY: ["libya", "libye", "ليبيا"], EGY: ["egypt", "egypte", "مصر"], SDN: ["sudan", "soudan", "السودان"],
  SAU: ["saudi arabia", "saudi", "ksa", "arabie saoudite", "السعودية"], YEM: ["yemen", "اليمن"], JOR: ["jordan", "jordanie", "الأردن"],
  IRQ: ["iraq", "irak", "العراق"], PAK: ["pakistan", "باكستان"], IRN: ["iran", "إيران", "ايران"], TUR: ["turkey", "turkiye", "turquie", "تركيا"],
  IND: ["india", "inde", "الهند"], FRA: ["france", "فرنسا"], DEU: ["germany", "allemagne", "ألمانيا"],
  GBR: ["united kingdom", "uk", "britain", "royaume uni", "بريطانيا"], USA: ["united states", "usa", "us", "america", "etats unis", "أمريكا"],
};
const DISEASE_ALIASES: Record<string, string[]> = {
  pku: ["pku", "phenylketonuria", "phenylcetonurie", "pah"], cf: ["cf", "cystic fibrosis", "mucoviscidose", "cftr"],
  wilson: ["wilson", "atp7b"], pompe: ["pompe", "gaa", "gsd ii"], mps1: ["mps i", "mps1", "hurler", "idua"],
  taysachs: ["tay sachs", "hexa"], sandhoff: ["sandhoff", "hexb"], mld: ["mld", "metachromatic", "arsa"], krabbe: ["krabbe", "galc"],
  npc: ["niemann pick", "npc", "npc1"], xp: ["xp", "xeroderma", "xpc", "xpa"], at: ["ataxia telangiectasia", "atm"],
  lgmdr1: ["calpainopathy", "lgmd", "capn3"], msud: ["msud", "maple syrup"], galt: ["galactosemia", "galactosemie", "galt"],
  hcu: ["homocystinuria", "homocystinurie", "cbs"], mcad: ["mcad", "acadm"], ga1: ["ga1", "glutaric", "gcdh"],
  pa: ["propionic", "pcca", "pccb"], mma: ["methylmalonic", "mmut"], ph1: ["hyperoxaluria", "agxt", "ph1"], dfnb1: ["gjb2", "dfnb1", "deafness", "connexin"],
};

export function resolveCountry(atlas: Atlas, q: string): string | null {
  const n = norm(q);
  const direct = atlas.countries.find((c) => c.iso3.toLowerCase() === n || norm(c.name) === n);
  if (direct) return direct.iso3;
  for (const [iso, al] of Object.entries(COUNTRY_ALIASES)) if (al.some((a) => norm(a) === n || n.includes(norm(a)))) return iso;
  return null;
}

export function resolveDisease(atlas: Atlas, q: string): string | null {
  const n = norm(q);
  const direct = atlas.diseases.find((d) => d.id === n || norm(d.name) === n || String(d.orpha) === n.replace("orpha ", ""));
  if (direct) return direct.id;
  for (const [id, al] of Object.entries(DISEASE_ALIASES)) if (al.some((a) => norm(a) === n || ` ${n} `.includes(` ${norm(a)} `))) return id;
  const partial = atlas.diseases.find((d) => norm(d.name).includes(n) && n.length >= 4);
  return partial?.id ?? null;
}

const pairOf = (atlas: Atlas, d: string, c: string): Pair | undefined => atlas.pairs.find((p) => p.disease === d && p.country === c);
const round = (x: number, sig = 3) => (x === 0 || !Number.isFinite(x) ? x : Number(x.toPrecision(sig)));
const r2 = (i: { p5: number; median: number; p95: number }) => ({ median: round(i.median), p5: round(i.p5), p95: round(i.p95) });

function pairSources(atlas: Atlas, p: Pair): ToolSource[] {
  const d = atlas.diseases.find((x) => x.id === p.disease)!;
  const c = atlas.countries.find((x) => x.iso3 === p.country)!;
  const s: ToolSource[] = [
    ...d.genes_detail.map((g) => ({ label: `gnomAD v4 · ${g.gene}`, url: g.url })),
    { label: c.consanguinity.source.label, url: c.consanguinity.source.url },
    { label: `World Bank births ${c.births.cbr_year}`, url: c.births.url },
    { label: "Europe PMC query", url: p.papers.url },
    { label: "ClinicalTrials.gov", url: p.trials.url },
  ];
  if (p.reported.best?.url) s.push({ label: `Largest reported series (PMID ${p.reported.best.pmid})`, url: p.reported.best.url });
  return s;
}

export const TOOL_SPECS = [
  {
    name: "get_estimate",
    description: "Expected affected births/year (with 90% interval), risk per birth, carrier frequency, consanguinity share, research attention, largest reported patient series, newborn-screening coverage and regional-genome estimate for ONE disease in ONE country.",
    parameters: { type: "object", properties: { disease: { type: "string" }, country: { type: "string" } }, required: ["disease", "country"], additionalProperties: false },
  },
  {
    name: "explain_calculation",
    description: "Step-by-step calculation of an estimate: allele frequency per gnomAD ancestry group × weight, inbreeding coefficient F from marriage rates, Hardy-Weinberg and identity-by-descent terms, births, Monte Carlo interval, attention ratio.",
    parameters: { type: "object", properties: { disease: { type: "string" }, country: { type: "string" } }, required: ["disease", "country"], additionalProperties: false },
  },
  {
    name: "rank_countries",
    description: "Rank the 18 modelled countries for a disease (or 'all') by a metric: expected | rate | attention | unseen | screening_gap.",
    parameters: {
      type: "object",
      properties: { disease: { type: "string" }, metric: { type: "string", enum: ["expected", "rate", "attention", "unseen", "screening_gap"] }, limit: { type: "integer" } },
      required: ["disease", "metric"],
      additionalProperties: false,
    },
  },
  {
    name: "country_profile",
    description: "A country's births, consanguinity and F, newborn-screening programme and gap, screening economics, and its diseases with the most expected births.",
    parameters: { type: "object", properties: { country: { type: "string" } }, required: ["country"], additionalProperties: false },
  },
  {
    name: "diagnostic_panel",
    description: "Best k-gene diagnostic panel for a country, ranked by expected affected births per year, with cumulative coverage.",
    parameters: { type: "object", properties: { country: { type: "string" }, k: { type: "integer" } }, required: ["country"], additionalProperties: false },
  },
  {
    name: "compare",
    description: "Compare one disease across several countries side by side.",
    parameters: { type: "object", properties: { disease: { type: "string" }, countries: { type: "array", items: { type: "string" } } }, required: ["disease", "countries"], additionalProperties: false },
  },
  {
    name: "list_diseases",
    description: "The 22 modelled diseases (id, name, genes, screenable) and the diseases deliberately excluded with reasons.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

export type ToolName = (typeof TOOL_SPECS)[number]["name"];

export function runTool(atlas: Atlas, name: string, args: Record<string, unknown>): ToolResult {
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");
  const needPair = () => {
    const d = resolveDisease(atlas, str("disease"));
    const c = resolveCountry(atlas, str("country"));
    if (!d) return { err: `Unknown or unmodelled disease "${str("disease")}". Call list_diseases.` };
    if (!c) return { err: `Unknown country "${str("country")}". Modelled: ${atlas.countries.map((x) => x.name).join(", ")}.` };
    return { d, c, p: pairOf(atlas, d, c)! };
  };

  switch (name) {
    case "get_estimate": {
      const r = needPair();
      if ("err" in r) return { ok: false, error: r.err };
      const { p } = r;
      const d = atlas.diseases.find((x) => x.id === p.disease)!;
      const c = atlas.countries.find((x) => x.iso3 === p.country)!;
      return {
        ok: true,
        data: {
          disease: d.name, country: c.name,
          expected_affected_births_per_year: r2(p.expected_births),
          risk_one_in: round(1e5 / p.per_100k.median),
          carrier_one_in: round(1 / p.carrier_freq.median),
          consanguinity_share_pct: round(p.consanguinity_share * 100),
          research_attention_ratio: p.attention_ratio === null ? null : round(p.attention_ratio),
          papers: p.papers.papers, open_trials: p.trials.open_trials,
          largest_reported_series: p.reported.best ? { n: p.reported.best.n, unit: p.reported.best.unit, pmid: p.reported.best.pmid, year: p.reported.best.year, sentence: p.reported.best.sentence } : null,
          reported_series_equals_years_of_expected_births: p.reported.years_of_expected === null ? null : round(p.reported.years_of_expected, 2),
          newborn_screening: { programme: c.screening.status, covers_this_disease: p.screening.covered, bloodspot_screenable: p.screening.bloodspot },
          regional_genomes: p.regional ? { region: p.regional.label, people: p.regional.people, expected_births_per_year: r2(p.regional.expected_births) } : null,
          caveat: d.caveat,
        },
        sources: pairSources(atlas, p),
      };
    }
    case "explain_calculation": {
      const r = needPair();
      if ("err" in r) return { ok: false, error: r.err };
      const t = r.p.trace;
      return {
        ok: true,
        data: {
          formula: "P = Σ_genes [ q²(1−F) + q·F ];  expected births = P × births per year",
          genes: t.genes.map((g) => ({
            gene: g.gene,
            ancestry_mix: g.groups.map((x) => ({ group: x.group, weight: x.weight, q_hat: round(x.q_hat), contribution: round(x.contribution) })),
            q: round(g.q), hardy_weinberg_term_q2_1_minus_F: round(g.hw_term), inbreeding_term_qF: round(g.ibd_term), P_gene: round(g.P),
          })),
          inbreeding: {
            first_cousin_pct: round(t.F.first_cousin_pct), other_consanguineous_pct: round(t.F.other_pct),
            F: round(t.F.F), formula: "F = first-cousin share × 1/16 + other consanguineous share × 1/64",
          },
          births_per_year: t.births,
          P_point: round(t.P), expected_point: round(t.expected),
          monte_carlo: { samples: t.mc.samples, median: round(t.mc.median), p5: round(t.mc.p5), p95: round(t.mc.p95) },
          attention: t.attention ? {
            share_of_papers: round(t.attention.share_papers), share_of_expected_births: round(t.attention.share_expected),
            ratio: r.p.attention_ratio === null ? null : round(r.p.attention_ratio),
          } : null,
        },
        sources: pairSources(atlas, r.p),
      };
    }
    case "rank_countries": {
      const dRaw = str("disease") || "all";
      const d = dRaw.toLowerCase() === "all" ? "all" : resolveDisease(atlas, dRaw);
      if (!d) return { ok: false, error: `Unknown disease "${dRaw}".` };
      const metric = str("metric") || "expected";
      const limit = Math.min(18, Math.max(1, Number(args.limit) || 5));
      const rows = atlas.countries.map((c) => {
        const ps = atlas.pairs.filter((p) => p.country === c.iso3 && (d === "all" || p.disease === d));
        const expected = ps.reduce((a, p) => a + p.expected_births.median, 0);
        const per100k = ps.reduce((a, p) => a + p.per_100k.median, 0);
        const papers = ps.reduce((a, p) => a + p.papers.papers, 0);
        return { country: c.name, iso3: c.iso3, expected, per100k, papers, gap: c.screening_gap.missed_births };
      });
      const totE = rows.reduce((a, r) => a + r.expected, 0);
      const totP = rows.reduce((a, r) => a + r.papers, 0);
      const scored = rows.map((r) => {
        const attention = totE > 0 && r.expected > 0 && totP > 0 ? r.papers / totP / (r.expected / totE) : null;
        const value =
          metric === "rate" ? r.per100k : metric === "attention" ? (attention ?? Infinity) : metric === "screening_gap" ? r.gap
            : metric === "unseen" ? r.expected / Math.max(attention ?? 0, 0.02) : r.expected;
        return { country: r.country, expected_births_per_year: round(r.expected), risk_per_100k_births: round(r.per100k), papers: r.papers, attention_ratio: attention === null ? null : round(attention), missed_screenable_births_per_year: round(r.gap), _v: value };
      });
      scored.sort((a, b) => (metric === "attention" ? a._v - b._v : b._v - a._v));
      return { ok: true, data: { disease: d, metric, ranking: scored.slice(0, limit).map(({ _v, ...x }) => x) }, sources: [{ label: "UNSEEN method", url: "/atlas#method" }] };
    }
    case "country_profile": {
      const iso = resolveCountry(atlas, str("country"));
      if (!iso) return { ok: false, error: `Unknown country "${str("country")}".` };
      const c = atlas.countries.find((x) => x.iso3 === iso)!;
      const ps = atlas.pairs.filter((p) => p.country === iso).sort((a, b) => b.expected_births.median - a.expected_births.median);
      const name = (id: string) => atlas.diseases.find((d) => d.id === id)!.name;
      return {
        ok: true,
        data: {
          country: c.name, births_per_year: c.births.births_per_year,
          consanguinity: { first_cousin_pct: c.consanguinity.first_cousin_pct, overall_pct: c.consanguinity.overall_pct, F_median: round(c.consanguinity.F.median) },
          total_expected_affected_births_per_year: round(ps.reduce((a, p) => a + p.expected_births.median, 0)),
          newborn_screening: {
            programme: c.screening.status, source_kind: c.screening.kind,
            covered_expected_births_per_year: round(c.screening_gap.covered_births),
            missed_screenable_births_per_year: round(c.screening_gap.missed_births),
            missed_diseases: c.screening_gap.missed_diseases.map(name),
          },
          screening_economics: {
            annual_cost_usd_range: c.economics.annual_cost_usd.map((x) => round(x)),
            detectable_cases_per_year: round(c.economics.cases_per_year),
            cost_per_case_found_usd_range: c.economics.cost_per_case_usd?.map((x) => round(x)) ?? null,
            care_cost_saved_usd_per_year: round(c.economics.savings_usd),
            benefit_cost_ratio_range: c.economics.benefit_cost_ratio.map((x) => round(x, 2)),
          },
          top_diseases: ps.slice(0, 6).map((p) => ({ disease: name(p.disease), expected: round(p.expected_births.median), attention: p.attention_ratio === null ? null : round(p.attention_ratio) })),
        },
        sources: [
          { label: c.consanguinity.source.label, url: c.consanguinity.source.url },
          { label: c.screening.src.label, url: c.screening.src.url },
          { label: atlas.meta.costs.saving_src.label, url: atlas.meta.costs.saving_src.url },
          { label: `World Bank births ${c.births.cbr_year}`, url: c.births.url },
        ],
      };
    }
    case "diagnostic_panel": {
      const iso = resolveCountry(atlas, str("country"));
      if (!iso) return { ok: false, error: `Unknown country "${str("country")}".` };
      const k = Math.min(30, Math.max(1, Number(args.k) || 10));
      const genes = atlas.pairs
        .filter((p) => p.country === iso)
        .flatMap((p) => p.per_gene.map((g) => ({ gene: g.gene, disease: atlas.diseases.find((d) => d.id === p.disease)!.name, expected: g.expected_births.median })))
        .sort((a, b) => b.expected - a.expected);
      const total = genes.reduce((a, g) => a + g.expected, 0);
      const top = genes.slice(0, k);
      const covered = top.reduce((a, g) => a + g.expected, 0);
      return {
        ok: true,
        data: { country: atlas.countries.find((c) => c.iso3 === iso)!.name, k, genes: top.map((g) => ({ ...g, expected: round(g.expected) })), coverage_pct: round((covered / total) * 100), covered_births: round(covered), total_births: round(total) },
        sources: [{ label: "UNSEEN panel optimiser (greedy over additive gene contributions)", url: "/atlas#method" }],
      };
    }
    case "compare": {
      const d = resolveDisease(atlas, str("disease"));
      if (!d) return { ok: false, error: `Unknown disease "${str("disease")}".` };
      const list = Array.isArray(args.countries) ? (args.countries as unknown[]).map(String) : [];
      const rows = list.map((q) => {
        const iso = resolveCountry(atlas, q);
        const p = iso ? pairOf(atlas, d, iso) : undefined;
        if (!p) return { country: q, error: "not modelled" };
        return { country: atlas.countries.find((c) => c.iso3 === iso)!.name, expected: r2(p.expected_births), risk_one_in: round(1e5 / p.per_100k.median), consanguinity_share_pct: round(p.consanguinity_share * 100), attention: p.attention_ratio === null ? null : round(p.attention_ratio), screened: p.screening.covered };
      });
      return { ok: true, data: { disease: atlas.diseases.find((x) => x.id === d)!.name, rows }, sources: [{ label: "UNSEEN method", url: "/atlas#method" }] };
    }
    case "list_diseases":
      return {
        ok: true,
        data: {
          modelled: atlas.diseases.map((d) => ({ id: d.id, name: d.name, genes: d.genes, bloodspot_screenable: d.bloodspot })),
          excluded: atlas.excluded,
        },
        sources: [{ label: "UNSEEN method", url: "/atlas#method" }],
      };
    default:
      return { ok: false, error: `Unknown tool ${name}` };
  }
}

/* ---------------- numeric grounding verifier ---------------- */

/** Numbers that appear in a piece of text, normalised (thousand separators removed, % dropped). */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(?<![\w.])(\d{1,3}(?:[,  ]\d{3})+|\d+(?:\.\d+)?)(?![\w])/g;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1].replace(/[,  ]/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function collectNumbers(value: unknown, into: number[]): void {
  if (typeof value === "number" && Number.isFinite(value)) into.push(value);
  else if (typeof value === "string") into.push(...extractNumbers(value));
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, into));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectNumbers(v, into));
}

/**
 * Every number the AI writes must be traceable to a tool result. A number counts as grounded if it
 * equals a tool number after the rounding a writer would plausibly apply (integer, 1-3 significant
 * figures, ×100 for percentages, 1/x for "1 in N"). Small integers (≤ 10) and years are exempt.
 */
export function verifyNumbers(answer: string, toolOutputs: unknown[]): { checked: number; grounded: number; ungrounded: number[] } {
  const pool: number[] = [];
  toolOutputs.forEach((o) => collectNumbers(o, pool));
  const forms = new Set<string>();
  const add = (x: number) => {
    if (!Number.isFinite(x) || x === 0) return;
    const ax = Math.abs(x);
    forms.add(String(Math.round(ax)));
    for (const s of [1, 2, 3]) forms.add(String(Number(ax.toPrecision(s))));
    forms.add(ax.toFixed(1));
    forms.add(ax.toFixed(2));
    if (ax >= 1000) forms.add(String(Math.round(ax / 100) * 100));
    if (ax >= 10000) forms.add(String(Math.round(ax / 1000) * 1000));
  };
  for (const x of pool) {
    add(x);
    add(x * 100);
    if (x > 0 && x < 1) add(1 / x);
  }
  const nums = extractNumbers(answer).filter((n) => !(Number.isInteger(n) && n <= 10) && !(n >= 1900 && n <= 2100));
  const norm1 = (n: number) => [String(n), String(Number(n.toPrecision(3))), n.toFixed(1), n.toFixed(2)];
  const ungrounded = nums.filter((n) => !norm1(n).some((f) => forms.has(f)));
  return { checked: nums.length, grounded: nums.length - ungrounded.length, ungrounded };
}
