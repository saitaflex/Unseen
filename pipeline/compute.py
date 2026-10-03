"""Build web/public/data/atlas.json from the cached raw data.

Deterministic (fixed seed). Every number in the output can be traced to config.py
citations, the cached gnomAD/context files, or the formulas in model.py.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from config import (COUNTRIES, DISEASES, EXCLUDED, FIRST_COUSIN_SHARE_IF_UNKNOWN, GNOMAD_GROUPS, LOW_PENETRANCE,
                    CURATED_PATHOGENIC, VALIDATION,
                    MAX_UNCLASSIFIED_LOF_AF, MAX_VARIANT_AF, MC_SAMPLES, METHOD_VERSION, RANDOM_SEED)
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


def gene_frequencies(gene: str) -> dict:
    data = json.loads((RAW / "gnomad" / f"{gene}.json").read_text(encoding="utf-8"))
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


def country_q_draws(genes: dict, gene: str, ancestry: dict, rng, extra: dict | None = None):
    total = np.zeros(MC_SAMPLES)
    for g, w in ancestry.items():
        grp = genes[gene]["groups"][g]
        n = grp["n_alleles"] + (extra or {}).get(g, 0)
        total += w * sample_q(grp["q_hat"], n, rng, MC_SAMPLES)
    return total


def main() -> None:
    rng = np.random.default_rng(RANDOM_SEED)
    ctx = json.loads((RAW / "context.json").read_text(encoding="utf-8"))
    genes = {g: gene_frequencies(g) for g in sorted({g for d in DISEASES for g in d["genes"]})}

    F_draws, countries_out = {}, []
    for c in COUNTRIES:
        F = sample_F(c["first_cousin"], c["overall"], FIRST_COUSIN_SHARE_IF_UNKNOWN, rng, MC_SAMPLES)
        F_draws[c["iso3"]] = F
        b = ctx["births"][c["iso3"]]
        countries_out.append({
            "iso3": c["iso3"], "name": c["name"],
            "births": b,
            "consanguinity": {
                "first_cousin_pct": c["first_cousin"], "overall_pct": c["overall"],
                "first_cousin_kind": "literature" if c["first_cousin"] else "inferred",
                "F": summarize(F), "source": c["src"],
            },
            "ancestry": c["ancestry"],
            "ancestry_kind": "inferred",
        })

    pairs = []
    for d in DISEASES:
        for c in COUNTRIES:
            iso = c["iso3"]
            F = F_draws[iso]
            births = ctx["births"][iso]["births_per_year"]
            P = np.zeros(MC_SAMPLES)
            P_more = np.zeros(MC_SAMPLES)
            q_sum = np.zeros(MC_SAMPLES)
            per_gene = []
            for gene in d["genes"]:
                q = country_q_draws(genes, gene, c["ancestry"], rng)
                q_more = country_q_draws(genes, gene, c["ancestry"], rng,
                                         extra={g: EXTRA_ALLELES * w for g, w in c["ancestry"].items()})
                pg = affected_probability(q, F)
                P += pg
                P_more += affected_probability(q_more, F)
                q_sum += q
                per_gene.append({"gene": gene, "expected_births": summarize(pg * births), "q": summarize(q)})
            expected = P * births
            # Which input drives the uncertainty? Freeze one at its median, see how much the interval shrinks.
            q_only = affected_probability(q_sum, np.median(F)) * births
            F_only = affected_probability(np.median(q_sum), F) * births
            width = lambda x: np.percentile(x, 95) - np.percentile(x, 5)  # noqa: E731
            w_all = width(expected)
            key = f"{d['id']}|{iso}"
            pairs.append({
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
                "papers": ctx["literature"][key],
                "trials": ctx["trials"][key],
            })

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

    diseases_out = []
    for d in DISEASES:
        diseases_out.append({
            **{k: d[k] for k in ("id", "orpha", "name", "genes", "group", "screenable")},
            "caveat": d.get("caveat"),
            "orphanet": ctx["orphanet"][d["id"]],
            "genes_detail": [{
                "gene": g, "n_qualifying": genes[g]["n_qualifying"], "retrieved_at": genes[g]["retrieved_at"],
                "groups": genes[g]["groups"], "top_variants": genes[g]["top_variants"],
                "url": f"https://gnomad.broadinstitute.org/gene/{g}?dataset=gnomad_r4",
            } for g in d["genes"]],
        })

    atlas = {
        "meta": {
            "method_version": METHOD_VERSION,
            "computed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "context_retrieved_at": ctx["retrieved_at"],
            "mc_samples": MC_SAMPLES, "max_variant_af": MAX_VARIANT_AF,
            "gnomad_groups": GNOMAD_GROUPS, "max_unclassified_lof_af": MAX_UNCLASSIFIED_LOF_AF,
            "low_penetrance_excluded": LOW_PENETRANCE, "curated_pathogenic": CURATED_PATHOGENIC,
            "gnomad_alleles": {g: max(genes[x]["groups"][g]["n_alleles"] for x in genes) for g in GNOMAD_GROUPS},
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


if __name__ == "__main__":
    main()
