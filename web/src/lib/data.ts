import type { Atlas, CellView, DiseaseKey, Interval, Layer, Pair } from "./types";

let atlasPromise: Promise<Atlas> | null = null;

/** Fetched once per page load and shared by the landing page and the atlas. */
export function loadAtlas(): Promise<Atlas> {
  atlasPromise ??= fetch("/data/atlas.json").then(async (res) => {
    if (!res.ok) throw new Error(`Could not load atlas data (${res.status})`);
    return (await res.json()) as Atlas;
  });
  atlasPromise.catch(() => (atlasPromise = null));
  return atlasPromise;
}

const sumIntervals = (xs: Interval[]): Interval => ({
  p5: xs.reduce((a, x) => a + x.p5, 0),
  median: xs.reduce((a, x) => a + x.median, 0),
  p95: xs.reduce((a, x) => a + x.p95, 0),
});

/** Index pairs once: key = `${disease}|${iso3}`. */
export function indexPairs(atlas: Atlas): Map<string, Pair> {
  return new Map(atlas.pairs.map((p) => [`${p.disease}|${p.country}`, p]));
}

/**
 * View model for one country under the selected disease (or all diseases summed).
 * For "all", intervals are summed per bound — a conservative (wider) envelope, stated in the UI.
 */
export function cellFor(atlas: Atlas, index: Map<string, Pair>, disease: DiseaseKey, iso3: string): CellView | null {
  const country = atlas.countries.find((c) => c.iso3 === iso3);
  if (!country) return null;
  const ids = disease === "all" ? atlas.diseases.map((d) => d.id) : [disease];
  const pairs = ids.map((id) => index.get(`${id}|${iso3}`)).filter((p): p is Pair => Boolean(p));
  if (pairs.length === 0) return null;
  const expected = sumIntervals(pairs.map((p) => p.expected_births));
  const per100k = sumIntervals(pairs.map((p) => p.per_100k));
  const papers = pairs.reduce((a, p) => a + p.papers.papers, 0);
  const trials = pairs.reduce((a, p) => a + p.trials.open_trials, 0);
  const consanguinityShare =
    expected.median > 0
      ? pairs.reduce((a, p) => a + p.consanguinity_share * p.expected_births.median, 0) / expected.median
      : 0;
  return { country, expected, per100k, papers, trials, attention: null, consanguinityShare, pairs };
}

/** All countries for a disease, with research attention computed relative to the group. */
export function cellsFor(atlas: Atlas, index: Map<string, Pair>, disease: DiseaseKey): CellView[] {
  const cells = atlas.countries
    .map((c) => cellFor(atlas, index, disease, c.iso3))
    .filter((c): c is CellView => c !== null);
  const totPapers = cells.reduce((a, c) => a + c.papers, 0);
  const totExpected = cells.reduce((a, c) => a + c.expected.median, 0);
  for (const c of cells) {
    const shareE = totExpected > 0 ? c.expected.median / totExpected : 0;
    const shareP = totPapers > 0 ? c.papers / totPapers : 0;
    c.attention = shareE > 0 ? shareP / shareE : null;
  }
  return cells;
}

export function layerValue(cell: CellView, layer: Layer): number | null {
  switch (layer) {
    case "expected":
      return cell.expected.median;
    case "rate":
      return cell.per100k.median;
    case "attention":
      return cell.attention;
    case "trials":
      return cell.expected.median > 0 ? (cell.trials / cell.expected.median) * 100 : null;
    case "screening":
      // one disease: 1 = national programme screens for it, 0 = blood-spot detectable but not screened, null = n/a
      if (cell.pairs.length === 1) {
        const s = cell.pairs[0].screening;
        return s.bloodspot ? (s.covered ? 1 : 0) : null;
      }
      return cell.country.screening_gap.missed_births;
  }
}

export interface PanelGene {
  gene: string;
  disease: string;
  diseaseName: string;
  screenable: boolean;
  expected: number;
}

/** Greedy panel optimiser. Genes contribute additively, so greedy = sort by expected births. */
export function optimisePanel(atlas: Atlas, index: Map<string, Pair>, iso3: string): PanelGene[] {
  const genes: PanelGene[] = [];
  for (const d of atlas.diseases) {
    const pair = index.get(`${d.id}|${iso3}`);
    if (!pair) continue;
    for (const g of pair.per_gene) {
      genes.push({
        gene: g.gene,
        disease: d.id,
        diseaseName: d.name,
        screenable: d.screenable,
        expected: g.expected_births.median,
      });
    }
  }
  return genes.sort((a, b) => b.expected - a.expected);
}

/** "Most unseen" ranking: large expected burden with little research attention. */
export function unseenScore(cell: CellView): number {
  if (cell.attention === null) return 0;
  return cell.expected.median / Math.max(cell.attention, 0.02);
}
