"""Build web/public/data/atlas.json (+ CSV) from the cached raw data.

Deterministic (fixed seed). Every number in the output can be traced to config.py citations, the
cached gnomAD / GME / context / literature files, or the formulas in model.py. For each disease x
country pair we also store a *trace*: the point-estimate calculation written out step by step, so the
app can show exactly how every expected-birth figure was produced.
"""
import csv
import gzip
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import gme
from config import (BLOODSPOT_SCREENABLE, COSTS, COUNTRIES, CURATED_PATHOGENIC, DISEASES, EXCLUDED,
                    FIRST_COUSIN_SHARE_IF_UNKNOWN, GME_REGION, GNOMAD_GROUPS, LOW_PENETRANCE, MAX_UNCLASSIFIED_LOF_AF,
                    MAX_VARIANT_AF, MC_SAMPLES, METHOD_VERSION, RANDOM_SEED, REGIONAL_PRIOR_ALLELES, SCREENING, VALIDATION)
from fetch_gnomad import is_plp
from model import affected_probability, consanguinity_share, sample_F, sample_q, summarize

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public" / "data" / "atlas.json"
EXTRA_ALLELES = 2000  # "what if we sequenced 1,000 more people from this population?"


def qualifies(v: dict, gene: str) -> bool:
    if v["filters"] or v["an"] == 0 or v["ac"] / v["an"] > MAX_VARIANT_AF:
        return False
    if (v["hgvsc"] or "") in LOW_PENETRANCE.get(gene, {}):
        return False
    if (v["hgvsc"] or "") in CURATED_PATHOGENIC.get(gene, {}):
        return True
    if v["clinvar"] is not None:
        # ClinVar has an opinion: trust it only when it is P/LP with at least one review star.
        return is_plp(v["clinvar"]) and (v["stars"] or 0) >= 1
    if not v["lof_hc"]:
        return False
    return all(an == 0 or ac / an <= MAX_UNCLASSIFIED_LOF_AF for ac, an in v["pops"].values())


def load_gene(gene: str) -> dict:
    return json.loads((RAW / "gnomad" / f"{gene}.json").read_text(encoding="utf-8"))


def gene_frequencies(gene: str, data: dict) -> dict:
    variants = [v for v in data["variants"] if qualifies(v, gene)]
    out = {"gene": gene, "retrieved_at": data["retrieved_at"], "n_qualifying": len(variants), "groups": {}}
    for g in GNOMAD_GROUPS:
        q_hat = 0.0
        observed = 0
        for v in variants:
            ac, an = v["pops"].get(g, [0, 0])
            if an > 0 and ac > 0:
                q_hat += ac / an
                observed += 1
        out["groups"][g] = {"q_hat": q_hat, "n_alleles": data["max_an"][g], "variants_observed": observed}
    top = sorted(variants, key=lambda v: v["ac"], reverse=True)[:5]
    out["top_variants"] = [{
        "id": v["id"], "hgvsc": v["hgvsc"], "hgvsp": v["hgvsp"], "clinvar": v["clinvar"],
        "lof_hc": v["lof_hc"], "af": v["ac"] / v["an"],
        "url": f"https://gnomad.broadinstitute.org/variant/{v['id']}?dataset=gnomad_r4",
    } for v in top]
    return out


def regional_variants(gene: str, data: dict) -> dict[str, dict]:
    """Qualifying variants for the regional (GME) lookup: gnomAD-qualifying ones plus every ClinVar
    P/LP >=1-star record — including founder alleles gnomAD never saw."""
    out = {v["id"]: {"hgvsc": v["hgvsc"], "hgvsp": v["hgvsp"], "in_gnomad": True}
           for v in data["variants"] if qualifies(v, gene)}
    for c in data.get("clinvar_plp", []):
        if c["id"] in out or (c["stars"] or 0) < 1 or (c["hgvsc"] or "") in LOW_PENETRANCE.get(gene, {}):
            continue
        out[c["id"]] = {"hgvsc": c["hgvsc"], "hgvsp": c["hgvsp"], "in_gnomad": False}
    return out


def gme_frequencies(gene_data: dict) -> dict:
    """{gene: {region: {"q": float, "variants": [...]}}} from the GME Variome."""
    keymap = {}
    for gene, data in gene_data.items():
        for vid, meta in regional_variants(gene, data).items():
            k = gme.annovar_key(vid)
            if k:
                keymap[k] = (gene, vid, meta)
    found = gme.load(set(keymap))
    out = {g: {r: {"q": 0.0, "variants": []} for r in gme.REGIONS} for g in gene_data}
    for k, afs in found.items():
        gene, vid, meta = keymap[k]
        for r, af in afs.items():
            if af > 0:
                out[gene][r]["q"] += af
                out[gene][r]["variants"].append({"id": vid, "hgvsp": meta["hgvsp"], "hgvsc": meta["hgvsc"],
                                                 "af": af, "in_gnomad": meta["in_gnomad"]})
    return out


def country_q_draws(genes: dict, gene: str, ancestry: dict, rng, extra: dict | None = None):
    total = np.zeros(MC_SAMPLES)
    for g, w in ancestry.items():
        grp = genes[gene]["groups"][g]
        n = grp["n_alleles"] + (extra or {}).get(g, 0)
        total += w * sample_q(grp["q_hat"], n, rng, MC_SAMPLES)
    return total


def F_point(c: dict) -> dict:
    """Point estimate of F from the midpoints of the reported ranges (what the trace shows)."""
    ov = sum(c["overall"]) / 2
    if c["first_cousin"] is None:
        share = sum(FIRST_COUSIN_SHARE_IF_UNKNOWN) / 2
        fc = ov * share
        assumed = share
    else:
        fc = min(sum(c["first_cousin"]) / 2, max(ov, sum(c["first_cousin"]) / 2))
        ov = max(ov, fc)
        assumed = None
    other = ov - fc
    return {"first_cousin_pct": fc, "other_pct": other, "assumed_first_cousin_share": assumed,
            "F": fc / 100 / 16 + other / 100 / 64}


def main() -> None:
    rng = np.random.default_rng(RANDOM_SEED)
    ctx = json.loads((RAW / "context.json").read_text(encoding="utf-8"))
    reported = json.loads((RAW / "reported.json").read_text(encoding="utf-8"))
    gene_data = {g: load_gene(g) for g in sorted({g for d in DISEASES for g in d["genes"]})}
    genes = {g: gene_frequencies(g, gene_data[g]) for g in gene_data}
    regional = gme_frequencies(gene_data)
    agent_path = ROOT / "data" / "evidence" / "agent_findings.json"
    agent = json.loads(agent_path.read_text(encoding="utf-8")) if agent_path.exists() else {"findings": []}

    F_draws, F_pt, countries_out = {}, {}, []
    for c in COUNTRIES:
        F = sample_F(c["first_cousin"], c["overall"], FIRST_COUSIN_SHARE_IF_UNKNOWN, rng, MC_SAMPLES)
        F_draws[c["iso3"]] = F
        F_pt[c["iso3"]] = F_point(c)
        b = ctx["births"][c["iso3"]]
        r = GME_REGION.get(c["iso3"])
        countries_out.append({
            "iso3": c["iso3"], "name": c["name"],
            "births": b,
            "consanguinity": {
                "first_cousin_pct": c["first_cousin"], "overall_pct": c["overall"],
                "first_cousin_kind": "literature" if c["first_cousin"] else "inferred",
                "F": summarize(F), "F_point": F_pt[c["iso3"]], "source": c["src"],
            },
            "ancestry": c["ancestry"],
            "ancestry_kind": "inferred",
            "gme_region": None if r is None else {"code": r, "label": gme.REGIONS[r]["label"], "n": gme.REGIONS[r]["n"]},
            "screening": SCREENING[c["iso3"]],
        })

    pairs = []
    for d in DISEASES:
        for c in COUNTRIES:
            iso = c["iso3"]
            F = F_draws[iso]
            Fp = F_pt[iso]["F"]
            births = ctx["births"][iso]["births_per_year"]
            region = GME_REGION.get(iso)
            P = np.zeros(MC_SAMPLES)
            P_more = np.zeros(MC_SAMPLES)
            P_reg = np.zeros(MC_SAMPLES)
            q_sum = np.zeros(MC_SAMPLES)
            per_gene, trace_genes, regional_genes = [], [], []
            P_point = 0.0
            for gene in d["genes"]:
                q = country_q_draws(genes, gene, c["ancestry"], rng)
                q_more = country_q_draws(genes, gene, c["ancestry"], rng,
                                         extra={g: EXTRA_ALLELES * w for g, w in c["ancestry"].items()})
                pg = affected_probability(q, F)
                P += pg
                P_more += affected_probability(q_more, F)
                q_sum += q
                per_gene.append({"gene": gene, "expected_births": summarize(pg * births), "q": summarize(q)})

                # --- point-estimate trace -------------------------------------------------------
                groups = [{"group": g, "weight": w, "q_hat": genes[gene]["groups"][g]["q_hat"],
                           "n_alleles": genes[gene]["groups"][g]["n_alleles"],
                           "contribution": w * genes[gene]["groups"][g]["q_hat"]} for g, w in c["ancestry"].items()]
                q_pt = sum(x["contribution"] for x in groups)
                hw = q_pt * q_pt * (1 - Fp)
                ibd = q_pt * Fp
                P_point += hw + ibd
                trace_genes.append({"gene": gene, "groups": groups, "q": q_pt, "hw_term": hw, "ibd_term": ibd, "P": hw + ibd})

                # --- regional (GME) Bayesian update ---------------------------------------------
                if region:
                    meta = gme.REGIONS[region]
                    n_reg = 2 * meta["n"]
                    q_gme = regional[gene][region]["q"]
                    x = q_gme * n_reg
                    a = REGIONAL_PRIOR_ALLELES * q + x + 0.5
                    b_ = REGIONAL_PRIOR_ALLELES * (1 - q) + (n_reg - x) + 0.5
                    q_post = rng.beta(np.maximum(a, 1e-9), np.maximum(b_, 1e-9))
                    P_reg += affected_probability(q_post, F)
                    regional_genes.append({
                        "gene": gene, "q_proxy": q_pt, "q_gme": q_gme, "alleles": n_reg,
                        "q_posterior": float(np.median(q_post)),
                        "variants": sorted(regional[gene][region]["variants"], key=lambda v: -v["af"])[:5],
                    })

            expected = P * births
            q_only = affected_probability(q_sum, np.median(F)) * births
            F_only = affected_probability(np.median(q_sum), F) * births
            width = lambda x: np.percentile(x, 95) - np.percentile(x, 5)  # noqa: E731
            w_all = width(expected)
            key = f"{d['id']}|{iso}"
            rep = reported["pairs"].get(key, {})
            # GJB2 cohorts are reported as mixed-cause deafness series; counts are not disease-specific.
            best = None if d["id"] == "dfnb1" else rep.get("best")
            med = float(np.median(expected))
            pair = {
                "disease": d["id"], "country": iso,
                "expected_births": summarize(expected),
                "per_100k": summarize(P * 1e5),
                "carrier_freq": summarize(2 * q_sum * (1 - q_sum)),
                "consanguinity_share": float(np.median(consanguinity_share(q_sum, F))),
                "per_gene": per_gene,
                "uncertainty": {
                    "from_genetics": float(width(q_only) / w_all) if w_all > 0 else 0.0,
                    "from_consanguinity": float(width(F_only) / w_all) if w_all > 0 else 0.0,
                    "narrowing_if_1000_sequenced": float(1 - width(P_more * births) / w_all) if w_all > 0 else 0.0,
                },
                "trace": {
                    "genes": trace_genes, "F": F_pt[iso], "births": births,
                    "P": P_point, "expected": P_point * births,
                    "mc": {"samples": MC_SAMPLES, **summarize(expected)},
                },
                "regional": None if not region else {
                    "region": region, "label": gme.REGIONS[region]["label"], "people": gme.REGIONS[region]["n"],
                    "prior_alleles": REGIONAL_PRIOR_ALLELES, "genes": regional_genes,
                    "expected_births": summarize(P_reg * births),
                },
                "reported": {
                    "abstracts_scanned": rep.get("abstracts_scanned", 0),
                    "best": best,
                    "years_of_expected": (best["n"] / med) if best and med > 0 else None,
                },
                "screening": {
                    "bloodspot": d["id"] in BLOODSPOT_SCREENABLE,
                    "covered": d["id"] in SCREENING[iso]["covers"],
                },
                "papers": ctx["literature"][key],
                "trials": ctx["trials"][key],
                # verbatim-quote-verified findings from the evidence agent (empty until it has been run)
                "evidence": [f for f in agent["findings"] if f["disease"] == d["id"] and f["country"] == iso],
            }
            pairs.append(pair)

    # Research attention relative to expected burden, per disease across our countries.
    for d in DISEASES:
        rows = [p for p in pairs if p["disease"] == d["id"]]
        tot_p = sum(p["papers"]["papers"] for p in rows)
        tot_e = sum(p["expected_births"]["median"] for p in rows)
        for p in rows:
            share_e = p["expected_births"]["median"] / tot_e if tot_e else 0
            share_p = p["papers"]["papers"] / tot_p if tot_p else 0
            p["attention_ratio"] = (share_p / share_e) if share_e > 0 else None
            p["burden_share"] = share_e
            p["trace"]["attention"] = {"papers": p["papers"]["papers"], "papers_total": tot_p, "share_papers": share_p,
                                       "expected_total": tot_e, "share_expected": share_e}

    # Country-level screening gap and economics.
    for c in countries_out:
        rows = [p for p in pairs if p["country"] == c["iso3"]]
        covered = sum(p["expected_births"]["median"] for p in rows if p["screening"]["covered"])
        gap = sum(p["expected_births"]["median"] for p in rows if p["screening"]["bloodspot"] and not p["screening"]["covered"])
        detectable = sum(p["expected_births"]["median"] for p in rows if p["screening"]["bloodspot"])
        births = c["births"]["births_per_year"]
        lo, hi = COSTS["test_usd"]
        c["screening_gap"] = {
            "covered_births": covered, "missed_births": gap, "detectable_births": detectable,
            "missed_diseases": [p["disease"] for p in rows if p["screening"]["bloodspot"] and not p["screening"]["covered"]],
        }
        c["economics"] = {
            "annual_cost_usd": [births * lo, births * hi],
            "cases_per_year": detectable,
            "cost_per_case_usd": [births * lo / detectable, births * hi / detectable] if detectable > 0 else None,
            "savings_usd": detectable * COSTS["saving_per_case_usd"],
            "benefit_cost_ratio": [detectable * COSTS["saving_per_case_usd"] / (births * hi),
                                   detectable * COSTS["saving_per_case_usd"] / (births * lo)],
        }

    diseases_out = []
    for d in DISEASES:
        diseases_out.append({
            **{k: d[k] for k in ("id", "orpha", "name", "genes", "group", "screenable")},
            "bloodspot": d["id"] in BLOODSPOT_SCREENABLE,
            "caveat": d.get("caveat"),
            "orphanet": ctx["orphanet"][d["id"]],
            "genes_detail": [{
                "gene": g, "n_qualifying": genes[g]["n_qualifying"], "retrieved_at": genes[g]["retrieved_at"],
                "groups": genes[g]["groups"], "top_variants": genes[g]["top_variants"],
                "clinvar_plp": len(gene_data[g].get("clinvar_plp", [])),
                "url": f"https://gnomad.broadinstitute.org/gene/{g}?dataset=gnomad_r4",
            } for g in d["genes"]],
        })

    atlas = {
        "meta": {
            "method_version": METHOD_VERSION,
            "computed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "context_retrieved_at": ctx["retrieved_at"],
            "reported_retrieved_at": reported.get("retrieved_at"),
            "mc_samples": MC_SAMPLES, "max_variant_af": MAX_VARIANT_AF,
            "gnomad_groups": GNOMAD_GROUPS, "max_unclassified_lof_af": MAX_UNCLASSIFIED_LOF_AF,
            "low_penetrance_excluded": LOW_PENETRANCE, "curated_pathogenic": CURATED_PATHOGENIC,
            "gnomad_alleles": {g: max(genes[x]["groups"][g]["n_alleles"] for x in genes) for g in GNOMAD_GROUPS},
            "gme": {"source": gme.SOURCE, "regions": gme.REGIONS, "prior_alleles": REGIONAL_PRIOR_ALLELES},
            "costs": COSTS,
            "extra_alleles": EXTRA_ALLELES,
            "agent": {"generated_at": agent.get("generated_at"), "model": agent.get("model"),
                      "verified": len(agent["findings"]), "rejected": len(agent.get("rejected", []))},
        },
        "diseases": diseases_out,
        "excluded": EXCLUDED,
        "validation": VALIDATION,
        "countries": countries_out,
        "pairs": pairs,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(atlas, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB), {len(pairs)} pairs")
    write_csv(atlas)


def write_csv(atlas: dict) -> None:
    """Flat, analysis-ready export of every disease x country estimate."""
    names = {d["id"]: d for d in atlas["diseases"]}
    countries = {c["iso3"]: c for c in atlas["countries"]}
    path = OUT.parent / "unseen_estimates.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["disease", "orpha", "genes", "iso3", "country", "births_per_year", "F_median",
                    "expected_births_p5", "expected_births_median", "expected_births_p95",
                    "per_100k_median", "carrier_freq_median", "consanguinity_share",
                    "regional_expected_median", "largest_reported_series", "reported_pmid",
                    "newborn_screening_covers", "papers", "open_trials", "attention_ratio", "method_version"])
        for p in atlas["pairs"]:
            d, c = names[p["disease"]], countries[p["country"]]
            e = p["expected_births"]
            best = p["reported"]["best"]
            w.writerow([d["name"], d["orpha"], "/".join(d["genes"]), c["iso3"], c["name"],
                        c["births"]["births_per_year"], f'{c["consanguinity"]["F"]["median"]:.5f}',
                        f'{e["p5"]:.2f}', f'{e["median"]:.2f}', f'{e["p95"]:.2f}',
                        f'{p["per_100k"]["median"]:.3f}', f'{p["carrier_freq"]["median"]:.6f}',
                        f'{p["consanguinity_share"]:.3f}',
                        f'{p["regional"]["expected_births"]["median"]:.2f}' if p["regional"] else "",
                        best["n"] if best else "", best["pmid"] if best else "",
                        "yes" if p["screening"]["covered"] else ("no" if p["screening"]["bloodspot"] else "n/a"),
                        p["papers"]["papers"], p["trials"]["open_trials"],
                        "" if p["attention_ratio"] is None else f'{p["attention_ratio"]:.4f}', METHOD_VERSION])
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
