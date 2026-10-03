"""Fetch per-ancestry allele counts for candidate pathogenic variants from gnomAD v4.

Writes data/raw/gnomad/<GENE>.json, keeping only variants that are ClinVar
pathogenic/likely pathogenic or high-confidence loss-of-function. Cached: genes
already on disk are skipped, so re-runs are cheap and the demo never needs the API.
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from config import CURATED_PATHOGENIC, DISEASES, GNOMAD_DATASET, GNOMAD_GROUPS

API = "https://gnomad.broadinstitute.org/api"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "gnomad"

QUERY = """
query($g: String!) {
  gene(gene_symbol: $g, reference_genome: GRCh38) {
    gene_id
    symbol
    variants(dataset: %s) {
      variant_id
      consequence
      hgvsc
      hgvsp
      lof
      lof_flags
      joint { ac an filters populations { id ac an } }
    }
    clinvar_variants {
      variant_id
      clinical_significance
      gold_stars
      review_status
      hgvsc
      hgvsp
      in_gnomad
    }
  }
}
""" % GNOMAD_DATASET


def is_plp(sig: str | None) -> bool:
    if not sig:
        return False
    s = sig.lower()
    if "pathogenic" not in s:
        return False
    return not any(bad in s for bad in ("conflicting", "uncertain", "benign"))


def fetch_gene(client: httpx.Client, gene: str) -> dict:
    for attempt in range(5):
        r = client.post(API, json={"query": QUERY, "variables": {"g": gene}})
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(15 * (attempt + 1))
            continue
        r.raise_for_status()
        body = r.json()
        if body.get("errors"):
            raise RuntimeError(f"{gene}: {body['errors'][:1]}")
        return body["data"]["gene"]
    raise RuntimeError(f"{gene}: gave up after retries")


def compact(gene: dict) -> dict:
    clinvar = {c["variant_id"]: c for c in gene["clinvar_variants"]}
    max_an = {g: 0 for g in GNOMAD_GROUPS}
    kept = []
    for v in gene["variants"]:
        j = v.get("joint")
        if not j:
            continue
        pops = {p["id"]: (p["ac"], p["an"]) for p in j["populations"] if p["id"] in GNOMAD_GROUPS}
        for g, (_, an) in pops.items():
            max_an[g] = max(max_an[g], an)
        cv = clinvar.get(v["variant_id"])
        plp = bool(cv) and is_plp(cv["clinical_significance"])
        lof_hc = v.get("lof") == "HC" and not v.get("lof_flags")
        curated = v.get("hgvsc") in CURATED_PATHOGENIC.get(gene["symbol"], {})
        if not (plp or lof_hc or curated) or j["ac"] == 0:
            continue
        kept.append({
            "id": v["variant_id"],
            "hgvsc": v.get("hgvsc"),
            "hgvsp": v.get("hgvsp"),
            "consequence": v["consequence"],
            "clinvar": cv["clinical_significance"] if cv else None,
            "stars": cv["gold_stars"] if cv else None,
            "lof_hc": lof_hc,
            "filters": j.get("filters") or [],
            "ac": j["ac"],
            "an": j["an"],
            "pops": {g: list(pops[g]) for g in pops},
        })
    return {
        "gene": gene["symbol"],
        "gene_id": gene["gene_id"],
        "dataset": GNOMAD_DATASET,
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "max_an": max_an,
        "n_variants_total": len(gene["variants"]),
        "variants": kept,
        # Every ClinVar P/LP record in the gene, whether or not gnomAD saw it. Founder alleles that
        # are rare in gnomAD but common in regional cohorts (GME) are matched against this list.
        "clinvar_plp": [
            {"id": c["variant_id"], "hgvsc": c.get("hgvsc"), "hgvsp": c.get("hgvsp"),
             "clinvar": c["clinical_significance"], "stars": c["gold_stars"]}
            for c in gene["clinvar_variants"] if is_plp(c["clinical_significance"])
        ],
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    genes = sorted({g for d in DISEASES for g in d["genes"]})
    only = {a for a in sys.argv[1:] if not a.startswith("--")}
    with httpx.Client(timeout=180) as client:
        for gene in genes:
            if only and gene not in only:
                continue
            path = OUT / f"{gene}.json"
            if path.exists() and not only and "--refresh" not in sys.argv:
                print(f"skip {gene} (cached)")
                continue
            data = compact(fetch_gene(client, gene))
            path.write_text(json.dumps(data, indent=1), encoding="utf-8")
            print(f"{gene}: {len(data['variants'])} candidate variants of {data['n_variants_total']}")
            time.sleep(6)


if __name__ == "__main__":
    main()
