"""Greater Middle East (GME) Variome: regional exome allele frequencies.

Scott et al. 2016, Nat Genet 48:1071 (doi:10.1038/ng.3592) — 1,111 unrelated exomes in six
subregions. The original site is offline; we use ANNOVAR's hg38 mirror (hg38_gme.txt.gz).
ANNOVAR's columns NWA, NEA, AP, SD, TP and CA map to the paper's subregions (CA = "Persia and
Pakistan", the only subregion left once the other five are matched by name).
"""
import gzip
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw" / "gme" / "hg38_gme.txt.gz"
# Small committed cache of only the variants UNSEEN matched, so the pipeline (and CI) rebuild without
# redistributing the full third-party table. Re-created whenever the full table is present.
CACHE = RAW.with_name("matched_variants.json")

# Unrelated individuals per subregion, quoted from the paper's Results section.
REGIONS = {
    "NWA": {"label": "Northwest Africa", "n": 85, "column": "GME_NWA"},
    "NEA": {"label": "Northeast Africa", "n": 423, "column": "GME_NEA"},
    "AP": {"label": "Arabian Peninsula", "n": 214, "column": "GME_AP"},
    "SD": {"label": "Syrian Desert", "n": 81, "column": "GME_SD"},
    "TP": {"label": "Turkish Peninsula", "n": 140, "column": "GME_TP"},
    "PP": {"label": "Persia and Pakistan", "n": 168, "column": "GME_CA"},
}
SOURCE = {
    "label": "GME Variome: Scott et al. 2016, Nature Genetics 48:1071 (1,111 exomes)",
    "url": "https://doi.org/10.1038/ng.3592",
    "quote": "Northwest Africa (NWA, 85 samples), Northeast Africa (NEA, 423 samples), Turkish Peninsula (TP, "
             "140 samples), Syrian Desert (SD, 81 samples), Arabian Peninsula (AP, 214 samples), and Persia and "
             "Pakistan (PP, 168 samples)",
}


def annovar_key(variant_id: str) -> tuple[str, int, str, str] | None:
    """gnomAD/VCF-style 'chrom-pos-ref-alt' (GRCh38) -> ANNOVAR (chrom, start, ref, alt)."""
    chrom, pos_s, ref, alt = variant_id.split("-")
    pos = int(pos_s)
    if len(ref) == 1 and len(alt) == 1:
        return chrom, pos, ref, alt
    if len(ref) > len(alt) and ref.startswith(alt):  # deletion
        return chrom, pos + len(alt), ref[len(alt):], "-"
    if len(alt) > len(ref) and alt.startswith(ref):  # insertion
        return chrom, pos + len(ref) - 1, "-", alt[len(ref):]
    return None  # complex / MNV: not representable, skipped


def load(keys: set[tuple[str, int, str, str]]) -> dict[tuple[str, int, str, str], dict[str, float]]:
    """Return {annovar_key: {region: AF}} for the requested variants (full table if present, else the cache)."""
    import json

    if not RAW.exists():
        cached = json.loads(CACHE.read_text(encoding="utf-8"))
        out = {}
        for k, afs in cached.items():
            chrom, start, ref, alt = k.split(":")
            key = (chrom, int(start), ref, alt)
            if key in keys:
                out[key] = afs
        return out
    found = _scan(keys)
    CACHE.write_text(json.dumps({f"{k[0]}:{k[1]}:{k[2]}:{k[3]}": v for k, v in sorted(found.items())}, indent=0), encoding="utf-8")
    return found


def _scan(keys: set[tuple[str, int, str, str]]) -> dict[tuple[str, int, str, str], dict[str, float]]:
    wanted_chroms = {k[0] for k in keys}
    out: dict[tuple[str, int, str, str], dict[str, float]] = {}
    with gzip.open(RAW, "rt") as f:
        header = f.readline().lstrip("#").rstrip("\n").split("\t")
        col = {name: i for i, name in enumerate(header)}
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if parts[0] not in wanted_chroms:
                continue
            key = (parts[0], int(parts[1]), parts[3], parts[4])
            if key in keys:
                out[key] = {r: _num(parts[col[meta["column"]]]) for r, meta in REGIONS.items()}
    return out


def _num(s: str) -> float:
    try:
        return float(s)
    except ValueError:
        return 0.0
