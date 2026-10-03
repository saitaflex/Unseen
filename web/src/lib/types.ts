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
  url: string;
}

export interface Disease {
  id: string;
  orpha: number;
  name: string;
  genes: string[];
  group: string;
  screenable: boolean;
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
    source: Source;
  };
  ancestry: Record<string, number>;
  ancestry_kind: "inferred";
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

export type Layer = "expected" | "rate" | "attention" | "trials";

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
