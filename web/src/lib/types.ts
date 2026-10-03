export interface Interval {
  p5: number;
  median: number;
  p95: number;
}

export interface Source {
  label: string;
  url: string;
}

export interface GeneGroupStat {
  q_hat: number;
  n_alleles: number;
  variants_observed: number;
}

export interface TopVariant {
  id: string;
  hgvsc: string | null;
  hgvsp: string | null;
  clinvar: string | null;
  lof_hc: boolean;
  af: number;
  url: string;
}

export interface GeneDetail {
  gene: string;
  n_qualifying: number;
  retrieved_at: string;
  groups: Record<string, GeneGroupStat>;
  top_variants: TopVariant[];
  clinvar_plp: number;
  url: string;
}

export interface Disease {
  id: string;
  orpha: number;
  name: string;
  genes: string[];
  group: string;
  screenable: boolean;
  bloodspot: boolean;
  caveat: string | null;
  orphanet: { orpha: number; preferred_term: string; url: string };
  genes_detail: GeneDetail[];
}

export interface Country {
  iso3: string;
  name: string;
  births: {
    births_per_year: number;
    crude_birth_rate: number;
    cbr_year: string;
    population: number;
    pop_year: string;
    source: string;
    url: string;
  };
  consanguinity: {
    first_cousin_pct: [number, number] | null;
    overall_pct: [number, number];
    first_cousin_kind: "literature" | "inferred";
    F: Interval;
    F_point: FPoint;
    source: Source;
  };
  ancestry: Record<string, number>;
  ancestry_kind: "inferred";
  gme_region: { code: string; label: string; n: number } | null;
  screening: { status: string; covers: string[]; kind: "literature" | "inferred"; src: Source };
  screening_gap: { covered_births: number; missed_births: number; detectable_births: number; missed_diseases: string[] };
  economics: {
    annual_cost_usd: [number, number];
    cases_per_year: number;
    cost_per_case_usd: [number, number] | null;
    savings_usd: number;
    benefit_cost_ratio: [number, number];
  };
}

export interface FPoint {
  first_cousin_pct: number;
  other_pct: number;
  assumed_first_cousin_share: number | null;
  F: number;
}

export interface TraceGene {
  gene: string;
  groups: { group: string; weight: number; q_hat: number; n_alleles: number; contribution: number }[];
  q: number;
  hw_term: number;
  ibd_term: number;
  P: number;
}

export interface ReportedSeries {
  n: number;
  unit: string;
  sentence: string;
  pmid: string | null;
  title: string;
  year: string | null;
  journal: string | null;
  url: string | null;
}

export interface Pair {
  disease: string;
  country: string;
  expected_births: Interval;
  per_100k: Interval;
  carrier_freq: Interval;
  consanguinity_share: number;
  per_gene: { gene: string; expected_births: Interval; q: Interval }[];
  uncertainty: {
    from_genetics: number;
    from_consanguinity: number;
    narrowing_if_1000_sequenced: number;
  };
  papers: { papers: number; query: string; url: string };
  trials: { open_trials: number; url: string };
  attention_ratio: number | null;
  burden_share: number;
  trace: {
    genes: TraceGene[];
    F: FPoint;
    births: number;
    P: number;
    expected: number;
    mc: Interval & { samples: number };
    attention?: { papers: number; papers_total: number; share_papers: number; expected_total: number; share_expected: number };
  };
  regional: null | {
    region: string;
    label: string;
    people: number;
    prior_alleles: number;
    genes: { gene: string; q_proxy: number; q_gme: number; alleles: number; q_posterior: number; variants: { id: string; hgvsp: string | null; hgvsc: string | null; af: number; in_gnomad: boolean }[] }[];
    expected_births: Interval;
  };
  reported: { abstracts_scanned: number; best: ReportedSeries | null; years_of_expected: number | null };
  screening: { bloodspot: boolean; covered: boolean };
  evidence: AgentFinding[];
}

export interface AgentFinding {
  type: "founder_variant" | "allele_frequency" | "patient_series";
  pmid: string;
  variant?: string;
  value: number;
  unit: string;
  quote: string;
  url: string;
  check: string;
}

export interface Atlas {
  meta: {
    method_version: string;
    computed_at: string;
    context_retrieved_at: string;
    mc_samples: number;
    max_variant_af: number;
    max_unclassified_lof_af: number;
    gnomad_groups: string[];
    gnomad_alleles: Record<string, number>;
    low_penetrance_excluded: Record<string, Record<string, string>>;
    curated_pathogenic: Record<string, Record<string, string>>;
    reported_retrieved_at?: string;
    gme: { source: Source & { quote: string }; regions: Record<string, { label: string; n: number; column: string }>; prior_alleles: number };
    costs: { test_usd: [number, number]; test_kind: string; saving_per_case_usd: number; saving_src: Source };
    extra_alleles: number;
    agent: { generated_at: string | null; model: string | null; verified: number; rejected: number };
  };
  diseases: Disease[];
  excluded: { name: string; genes: string[]; reason: string }[];
  validation: {
    country: string;
    disease: string;
    observed_one_in: [number, number];
    label: string;
    source: Source;
    note?: string;
  }[];
  countries: Country[];
  pairs: Pair[];
}

export type Layer = "expected" | "rate" | "attention" | "trials" | "screening";

export type DiseaseKey = string | "all";

/** A disease×country (or all-diseases×country) view model used by the UI. */
export interface CellView {
  country: Country;
  expected: Interval;
  per100k: Interval;
  papers: number;
  trials: number;
  attention: number | null;
  consanguinityShare: number;
  pairs: Pair[];
}
