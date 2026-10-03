import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answer, detectLang } from "./ask";
import { cellsFor, indexPairs, optimisePanel } from "./data";
import type { Atlas } from "./types";

const atlas = JSON.parse(readFileSync(new URL("../../public/data/atlas.json", import.meta.url), "utf8")) as Atlas;

describe("language detection", () => {
  it("detects Arabic, French and English", () => {
    expect(detectLang("كم طفلًا مصابًا يولد في تونس؟")).toBe("ar");
    expect(detectLang("Combien d'enfants naissent avec la PCU en Tunisie ?")).toBe("fr");
    expect(detectLang("How many PKU babies are born in Tunisia?")).toBe("en");
  });
});

describe("grounded answers", () => {
  it("answers a count question with numbers taken from the atlas and citations", () => {
    const a = answer(atlas, "How many PKU babies are born in Tunisia each year?", "all", null);
    const pair = atlas.pairs.find((p) => p.disease === "pku" && p.country === "TUN")!;
    expect(a.facts.expected_births).toEqual(pair.expected_births);
    expect(a.citations.some((c) => c.url.includes("gnomad"))).toBe(true);
    expect(a.refused).toBeFalsy();
  });

  it("refuses individual medical advice in every language", () => {
    expect(answer(atlas, "What is the best treatment for my son?", "pku", "TUN").refused).toBe(true);
    expect(answer(atlas, "Quel traitement pour mon fils ?", "pku", "TUN").refused).toBe(true);
    expect(answer(atlas, "ما هو أفضل علاج لابني؟", "pku", "TUN").refused).toBe(true);
  });

  it("does not mistake 'treatment' for the ATM gene", () => {
    const a = answer(atlas, "What is the best treatment for my son?", "pku", "TUN");
    expect(a.citations[0].label).toContain("Phenylketonuria");
  });

  it("is honest about diseases it does not model", () => {
    const a = answer(atlas, "How many SMA babies are born in Egypt?", "all", null);
    expect(a.text).toContain("no supported evidence");
  });

  it("answers in Arabic for Arabic questions", () => {
    const a = answer(atlas, "كم طفلًا مصابًا بالتليف الكيسي يولد في باكستان سنويًا؟", "all", null);
    expect(a.lang).toBe("ar");
    expect(a.text).toContain("باكستان");
  });
});

describe("data helpers", () => {
  const index = indexPairs(atlas);
  it("panel optimiser is sorted and covers all genes", () => {
    const genes = optimisePanel(atlas, index, "PAK");
    const totalGenes = atlas.diseases.reduce((a, d) => a + d.genes.length, 0);
    expect(genes).toHaveLength(totalGenes);
    for (let i = 1; i < genes.length; i++) expect(genes[i - 1].expected).toBeGreaterThanOrEqual(genes[i].expected);
  });
  it("attention ratios average to 1 when weighted by burden", () => {
    const cells = cellsFor(atlas, index, "pku");
    const tot = cells.reduce((a, c) => a + c.expected.median, 0);
    const weighted = cells.reduce((a, c) => a + (c.attention ?? 0) * (c.expected.median / tot), 0);
    expect(weighted).toBeCloseTo(1, 6);
  });
});
