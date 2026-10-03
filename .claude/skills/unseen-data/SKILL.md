---
name: unseen-data
description: Refresh or extend the UNSEEN atlas data — add a disease or country, re-fetch gnomAD/context, recompute, and validate. Use when asked to add diseases/countries, update data, or check estimates.
---

# UNSEEN data pipeline

All inputs live in `pipeline/config.py`; every non-computed value must carry a citation.

## Add a disease
1. It must be **autosomal recessive** and caused mostly by SNVs/indels. Otherwise add it to `EXCLUDED` with the reason.
2. Add an entry to `DISEASES` (id, ORPHA code, genes, search, group, screenable), plus synonyms in `SEARCH_TERMS`.
3. `python fetch_gnomad.py GENE1 GENE2`, then `python fetch_context.py` (it verifies the ORPHA code name; check that the printout matches).
4. `python compute.py`, then inspect the top qualifying variants for each gene, as in the CFTR/GJB2 checks:
   any variant with AF > 0.2% in some group needs a reason. Known low-penetrance alleles go in `LOW_PENETRANCE`;
   well-established alleles that ClinVar marks "conflicting" go in `CURATED_PATHOGENIC`. Both lists are shown in the app.
5. Sanity-check the European incidence against a cited figure. Add it to `VALIDATION` if newborn-screening data exists.

## Add a country
Needs a cited consanguinity source (first-cousin % and overall %, as ranges), ancestry weights (stated as inferred),
an ISO3→numeric mapping in `web/src/components/WorldMap.tsx`, and demonyms in `fetch_context.py` and `web/src/lib/ask.ts`.

## Always finish with
`python -m pytest -q tests` (pipeline) and `npm test && npm run build` (in `web/`).
Never hand-edit `web/public/data/atlas.json`; regenerate it.
