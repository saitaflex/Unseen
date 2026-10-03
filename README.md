<p align="center"><img src="web/public/brand/unseen-wordmark.png" alt="UNSEEN" width="360"></p>

<h3 align="center">The Hidden Patients Atlas</h3>
<p align="center"><em>Every rare-disease map shows where patients have been found. UNSEEN shows where they haven't been found yet.</em></p>
<p align="center">Hack-Nation 7 · Challenge 05 · AI Atlas for the World's Rare Diseases (Buffalo Initiative × OpenAI)</p>

---

## The problem (5 whys)

A child with a rare recessive disease in Sudan, Yemen or Pakistan is never diagnosed → nobody tests → ministries fund tests by
registry counts, and the registry says ~0 → registries only count *diagnosed* patients, and there are few geneticists → nobody
computes how many patients **should** exist → the inputs (gnomAD, ClinVar, consanguinity surveys, births, literature) sit in silos.

**Root cause:** the data treats "nobody has looked" as "nobody is there".

## What UNSEEN does

For **22 autosomal-recessive diseases × 18 countries** it computes

```
expected affected births / year = [q²(1−F) + q·F] × births
```

- **q** = pathogenic allele frequency from gnomAD v4 (ClinVar P/LP ≥1★ + rare high-confidence LoF), per ancestry group
- **F** = population inbreeding coefficient from published consanguinity surveys
- uncertainty from 4,000 Monte-Carlo draws (Jeffreys Beta on q, survey ranges on F)

…then compares it with **how much the world is looking**: Europe PMC papers and ClinicalTrials.gov trials per country.

**Headline finding:** about **91%** of the expected affected births across the 18 countries are outside Western Europe and the US. Those countries get **37%** of the papers.

### Features
- **Map:** choropleth for four layers (expected births, risk per birth, research attention, trial access). Hollow rings show the expected patients, the open circle from the logo.
- **Evidence chain:** every number carries its source and a provenance badge: `observed · literature · inferred · curated · computed`.
- **Action plan:** the best k-gene diagnostic panel per country, with newborn-screening coverage.
- **Most unseen ranking:** countries with a large expected burden and little research attention.
- **Ask the Atlas:** works in English, French and Arabic. The deterministic engine answers only from the atlas, with citations, and refuses individual medical advice. An optional OpenAI narrator (`/api/ask`) may only rephrase facts that are already verified.
- **Story mode:** a 7-step guided demo with deep links (`?story=1..7`), plus shareable state (`?d=pku&c=SDN&l=attention`).
- **Validation:** the model is checked against countries with universal newborn screening, including the cases where it misses:

| Check | Observed | UNSEEN |
|---|---|---|
| PKU · Germany | 1 in 5,262 | 1 in 6,200 |
| MCAD · Germany | 1 in 10,086 | 1 in 9,800 |
| Galactosemia · Germany | 1 in 76,821 | 1 in 51,000 |
| PKU · Turkey (high consanguinity) | 1 in 4,500 | 1 in 2,800 |
| PKU · Iran | 1 in 5,200–15,000 | 1 in 2,400 (runs high: explained in the app) |

## Run it

```bash
# 1) data pipeline (Python 3.11+): only needed to refresh data; results are committed
cd pipeline
pip install httpx numpy pytest
python fetch_gnomad.py      # cached per gene in data/raw/gnomad
python fetch_context.py     # Orphanet, World Bank, Europe PMC, ClinicalTrials.gov
python compute.py           # → web/public/data/atlas.json
python -m pytest -q tests

# 2) web app
cd ../web
npm install
npm run dev                 # http://localhost:5173
npm test && npm run build
```

Optional AI narrator on Vercel: set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`). Without it the app uses the grounded engine.

## Repo layout

```
pipeline/   config.py (every cited input) · fetch_*.py · model.py (pure math) · compute.py · tests/
data/raw/   cached API responses + source documents (reproducible, offline)
web/        React 19 + Vite + Tailwind 4 + d3-geo · api/ask.ts (Vercel Function) · src/lib/ask.ts (grounded engine)
.claude/skills/  project skills for extending UNSEEN with an AI agent
```

## Honest limits
- gnomAD's Middle-Eastern group has about 3,000 people (compared with about 590,000 Europeans), and ClinVar favours variants found in Europeans. Local founder alleles are missed, so estimates for under-studied populations are mostly **too low**.
- Ancestry ≠ country: the weights are stated assumptions. We estimate affected *births*, not living patients, and assume full penetrance.
- Paper counts measure attention, not diagnoses.
- The scope is SNV/indel recessive diseases only. SMA, Friedreich ataxia, CAH, Gaucher, FMF and α-thalassemia are excluded on purpose, and the app explains why.

## Ethics
Consanguineous marriage is a cultural practice, not a failing. UNSEEN uses it only to bring diagnostics *to* communities that have been left out. Everything is population-level: no personal data and no medical advice.

## Skills the team needs
| Role | Skills |
|---|---|
| Data / genetics | Python, pandas/numpy, population genetics (Hardy–Weinberg, inbreeding F), ClinVar/gnomAD literacy |
| Frontend | React + TypeScript, Tailwind, d3-geo / SVG maps, accessibility |
| AI | Grounded QA design, prompt guardrails, OpenAI API, evaluation of hallucination risk |
| Domain & pitch | Rare-disease epidemiology, newborn screening, health policy storytelling |
