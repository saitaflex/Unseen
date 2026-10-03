<p align="center"><img src="web/public/brand/unseen-wordmark.png" alt="UNSEEN" width="360"></p>

<h3 align="center">The Hidden Patients Atlas</h3>
<p align="center"><em>Every rare-disease map shows where patients have been found. UNSEEN shows where they haven't been found yet.</em></p>
<p align="center">Hack-Nation 7 · Challenge 05 · AI Atlas for the World's Rare Diseases (Buffalo Initiative × OpenAI)</p>
<p align="center">
  <a href="https://unseen-atlas.vercel.app"><b>Live demo</b></a> ·
  <a href="https://unseen-atlas.vercel.app/atlas?story=1">60-second story</a> ·
  <a href="https://unseen-atlas.vercel.app/data/unseen_estimates.csv">Download the data (CSV)</a><br/>
  <a href="https://github.com/saitaflex/Unseen/actions/workflows/ci.yml"><img src="https://github.com/saitaflex/Unseen/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

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

### What's new in v0.2 (method 0.2.0)
- **Every calculation is traceable.** Each of the 396 estimates stores its worked calculation, so "Show the full calculation" lays out q per ancestry group, F from marriage rates, the two terms of P, births, the Monte Carlo interval, research attention, the regional-genome update and the reported series. 17 formulas are documented on the Method page.
- **Regional genomes.** The GME Variome (1,111 Middle-Eastern exomes across 6 subregions) is matched against every ClinVar P/LP variant, *including founder alleles gnomAD never saw*, and combined with the ancestry-mix estimate by a Bayesian update. Finding: for PKU it raises Turkey and Iran, which shows the model's overestimate there is not an ancestry error.
- **Diagnosed so far.** The largest published patient series for every disease × country is text-mined from up to 300 Europe PMC abstracts, kept with its verbatim sentence and PMID, and shown as "years of expected births".
- **Newborn screening gap.** National programmes for all 18 countries, each with a cited source. About **26,900** treatable children a year are born in countries that don't screen for their disease. Includes a cost and benefit range (Lebanon cost-benefit study).
- **AI agent (OpenAI tool calling).** `/api/agent` reads the atlas only through 7 typed tools. A **numeric grounding verifier** checks every number in the answer against the tool outputs and forces a rewrite, or falls back to the offline engine. It is tested against a simulated model.
- **Evidence agent.** `pipeline/evidence_agent.py` reads papers and records founder variants and patient counts. A finding is kept only if its quote is found *verbatim* in the retrieved text and contains the number.

### Features
- **Animated intro:** a big dot (the unseen patient) opens into the logo's ring, the dots drip down and the U draws itself. The mark is rebuilt as SVG from the logo's own measured geometry, and it respects reduced motion. Short visual chapters follow: problem, method, finding, proof, under the hood.
- **Map:** choropleth for four layers (expected births, risk per birth, research attention, trial access). Hollow rings show the expected patients, the open circle from the logo.
- **Evidence chain:** every number carries its source and a provenance badge: `observed · literature · inferred · curated · computed`.
- **Action plan:** the best k-gene diagnostic panel per country, with newborn-screening coverage.
- **Most unseen ranking:** countries with a large expected burden and little research attention.
- **Ask the Atlas:** works in English, French and Arabic. The deterministic engine answers only from the atlas, with citations, and refuses individual medical advice. An optional OpenAI narrator (`/api/ask`) may only rephrase facts that are already verified.
- **Story mode:** a 7-step guided demo with deep links (`/atlas?story=1..7`), plus shareable state (`/atlas?d=pku&c=SDN&l=attention`).
- **Open data:** every estimate as a flat CSV (`/data/unseen_estimates.csv`) and the full atlas as JSON.
- **Engineering:** 48 automated tests (18 pipeline + 30 web, including the agent loop against a mocked OpenAI), and CI that re-runs the tests, rebuilds the app and checks that the dataset is byte-reproducible from cached inputs (pinned numpy, fixed seed).
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
pip install -r requirements.txt
python fetch_gnomad.py      # cached per gene in data/raw/gnomad
python fetch_context.py     # Orphanet, World Bank, Europe PMC, ClinicalTrials.gov
python mine_reported.py     # largest reported patient series (cached abstracts)
python compute.py           # → web/public/data/atlas.json
python -m pytest -q tests

# 2) web app
cd ../web
npm install
npm run dev                 # http://localhost:5173
npm test && npm run build
```

**Turn on the AI agent** (otherwise the app uses the offline grounded engine):
```bash
cd web && npx vercel env add OPENAI_API_KEY production   # paste the key when prompted
npx vercel deploy --prod                                   # optional: OPENAI_MODEL (default gpt-5-mini)
```
**Run the evidence agent** (writes `data/evidence/agent_findings.json`, merged by `compute.py`):
```bash
cd pipeline && OPENAI_API_KEY=... python evidence_agent.py --pairs 10 && python compute.py
```

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
