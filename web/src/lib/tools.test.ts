import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractNumbers, resolveCountry, resolveDisease, runTool, TOOL_SPECS, verifyNumbers } from "./tools";
import type { Atlas } from "./types";

const atlas = JSON.parse(readFileSync(new URL("../../public/data/atlas.json", import.meta.url), "utf8")) as Atlas;

describe("name resolution", () => {
  it("resolves countries in three languages and by ISO code", () => {
    expect(resolveCountry(atlas, "Tunisie")).toBe("TUN");
    expect(resolveCountry(atlas, "السودان")).toBe("SDN");
    expect(resolveCountry(atlas, "deu")).toBe("DEU");
  });
  it("resolves diseases by name, alias or gene", () => {
    expect(resolveDisease(atlas, "phenylketonuria")).toBe("pku");
    expect(resolveDisease(atlas, "mucoviscidose")).toBe("cf");
    expect(resolveDisease(atlas, "ATP7B")).toBe("wilson");
    expect(resolveDisease(atlas, "spinal muscular atrophy")).toBeNull();
  });
});

describe("tools", () => {
  it("every declared tool runs", () => {
    const args: Record<string, Record<string, unknown>> = {
      get_estimate: { disease: "pku", country: "Sudan" },
      explain_calculation: { disease: "pku", country: "Sudan" },
      rank_countries: { disease: "all", metric: "unseen" },
      country_profile: { country: "Pakistan" },
      diagnostic_panel: { country: "Egypt", k: 5 },
      compare: { disease: "cf", countries: ["Tunisia", "France"] },
      list_diseases: {},
    };
    for (const spec of TOOL_SPECS) {
      const r = runTool(atlas, spec.name, args[spec.name]);
      expect(r.ok, spec.name).toBe(true);
    }
  });

  it("explain_calculation reproduces the Monte Carlo median from its own steps", () => {
    const r = runTool(atlas, "explain_calculation", { disease: "pku", country: "Tunisia" });
    const d = r.data as { genes: { P_gene: number }[]; births_per_year: number; expected_point: number; monte_carlo: { median: number } };
    const P = d.genes.reduce((a, g) => a + g.P_gene, 0);
    expect(P * d.births_per_year).toBeCloseTo(d.expected_point, 0);
    // the point estimate and the simulation agree within 5%
    expect(Math.abs(d.expected_point - d.monte_carlo.median) / d.monte_carlo.median).toBeLessThan(0.05);
  });

  it("the trace's terms add up for every pair", () => {
    for (const p of atlas.pairs) {
      const sum = p.trace.genes.reduce((a, g) => a + g.hw_term + g.ibd_term, 0);
      expect(sum).toBeCloseTo(p.trace.P, 12);
      for (const g of p.trace.genes) expect(g.hw_term).toBeCloseTo(g.q * g.q * (1 - p.trace.F.F), 14);
    }
  });

  it("reports errors for unmodelled inputs instead of guessing", () => {
    const r = runTool(atlas, "get_estimate", { disease: "SMA", country: "Egypt" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/list_diseases/);
  });

  it("screening gap equals the sum of uncovered blood-spot diseases", () => {
    for (const c of atlas.countries) {
      const gap = atlas.pairs
        .filter((p) => p.country === c.iso3 && p.screening.bloodspot && !p.screening.covered)
        .reduce((a, p) => a + p.expected_births.median, 0);
      expect(c.screening_gap.missed_births).toBeCloseTo(gap, 6);
    }
  });
});

describe("numeric grounding verifier", () => {
  const tool = { expected: { median: 663.2, p5: 554.1, p95: 791.4 }, risk_one_in: 2580, share: 0.761, papers: 2 };
  it("extracts numbers with thousand separators", () => {
    expect(extractNumbers("1,234 births and 56.7% of 12 000")).toEqual([1234, 56.7, 12000]);
  });
  it("accepts rounded tool numbers, percentages and 1-in-N forms", () => {
    const v = verifyNumbers("About **663** births a year (554–791), 1 in 2,600 births; 76% from related parents.", [tool]);
    expect(v.ungrounded).toEqual([]);
    expect(v.checked).toBe(5);
  });
  it("flags invented numbers", () => {
    const v = verifyNumbers("About 900 births a year, 1 in 1,234.", [tool]);
    expect(v.ungrounded).toEqual([900, 1234]);
  });
  it("ignores small integers and years", () => {
    expect(verifyNumbers("In 2024, 3 programmes and 7 diseases.", [tool]).checked).toBe(0);
  });
});
