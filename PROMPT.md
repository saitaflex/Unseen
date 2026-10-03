# UNSEEN: The Hidden Patients Atlas

> **Hack-Nation 7, Global AI Hackathon. Challenge 05: "AI Atlas for the World's Rare Diseases" (Buffalo Initiative x OpenAI)**
>
> **One-line pitch:** *Every rare-disease map shows where patients have been found. UNSEEN shows where they haven't been found yet.*
>
> Other names considered: *Ghostmap*, *The Hidden Many*, *Penumbra*. We chose **UNSEEN** because it is short, it fits the challenge, and the pitch follows from it: the patients who are invisible in the data.

This file is the master build prompt. Paste it whole into a coding agent (Claude Code, Codex, Cursor), or give it to any teammate. It contains everything needed to build, demo and pitch the project in about 24 hours.

---

## 0. Role and mission (for the AI agent building this)

You are a senior full-stack and data engineer working with a hackathon team. Build **UNSEEN**, an agentic atlas. For each rare **autosomal recessive** disease and each country, it estimates how many affected children *should* be born each year, using population genetics. It compares that number with how many patients have *actually been reported*, and shows the difference (the **hidden-patient gap**) on a world map. It then turns the gap into concrete actions: which genetic tests to fund, where the expert centres and trials are, and what evidence would change the estimate.

Non-negotiable rules:
1. **The LLM never invents a medical fact or a number.** Every number comes from deterministic code or from a cited source. Every claim carries provenance: `source`, `retrieved_at`, and `kind = observed | literature | inferred`.
2. **No arithmetic inside the LLM.** All math runs in Python tools the agents call.
3. **Population-level only.** No individual patient data, no diagnosis of individuals, and no medical advice.
4. **Show uncertainty everywhere.** Every estimate is an interval, never a single unqualified number.
5. **If the data does not support an answer, say so** and state *what evidence would change the answer*.

---

## 1. The problem: the 5 whys

**Problem:** A child with a rare recessive disease in rural Tunisia, Pakistan, Sudan or Yemen is never diagnosed.

| # | Why? | Answer |
|---|------|--------|
| 1 | Why is the child never diagnosed? | Nobody tests for the disease. |
| 2 | Why does nobody test? | Ministries and NGOs choose which genetic tests and newborn-screening programmes to fund by counting registry cases, and the registry shows about zero. |
| 3 | Why does the registry show zero? | Registries only count people who were diagnosed. Few geneticists means few diagnoses, which means "no disease", which means no tests. **The loop closes on itself.** |
| 4 | Why does nobody break the loop? | Nobody calculates how many patients *should* exist there. |
| 5 | Why not? | The pieces sit in separate places: variant frequencies by ancestry (gnomAD), which variants cause disease (ClinVar), consanguinity rates (literature), founder mutations (buried in papers), birth numbers (UN / World Bank), and reported cases (Orphanet / papers). Combining them for one disease in one country is days of work for a geneticist. Across 7,000 diseases and 195 countries, nobody does it. |

**Root cause:** *Absence of evidence is treated as evidence of absence.* Undiagnosed patients don't appear in the data, so they never get resources.

**Why this matters (for the pitch):**
- More than 300 million people live with a rare disease, and about 72% of rare diseases are genetic.
- Populations where consanguineous marriage is common (much of the Middle East, North Africa and South Asia) have a much higher rate of recessive disease. These are often the places with the fewest geneticists and the thinnest registries.
- The "diagnostic odyssey" averages years even in rich countries. In low-resource settings, many patients die without ever receiving a name for their disease.

*(Before putting any statistic on a slide, have the Evidence Miner attach a source to it. Do not hard-code numbers you cannot cite.)*

---

## 2. The solution

### 2.1 What UNSEEN does

For each **disease x country** pair:

```
expected affected births / year   (genetics x consanguinity x births)
- reported patients                (literature, registries, Orphanet)
= HIDDEN-PATIENT GAP               (with an uncertainty interval)
```

It shows:
- **World map:** a heatmap of the gap, or of the *visibility ratio* = reported / expected, for the selected disease.
- **Country panel:** expected vs reported, with intervals; the evidence cards behind each number; and a provenance badge on every figure.
- **Action plan:**
  - **Panel optimiser:** "If Tunisia funds a 10-gene panel, these 10 genes cover the most expected hidden births."
  - The nearest expert centres, diagnostic labs (NCBI Genetic Testing Registry) and recruiting trials (ClinicalTrials.gov).
  - "What would change this estimate": the missing data, ranked by how much it would shrink the uncertainty.
- **Ask the Atlas (chat, voice optional):** a planner, NGO or patient-group leader asks in their own language (Arabic, French, English, ...). The agent answers **only** from the computed graph and the cited evidence.

### 2.2 Who it is for
1. **Ministries of health and newborn-screening planners:** what to screen for, and where.
2. **NGOs, WHO and patient organisations:** advocacy backed by numbers ("our country should have ~N patients/year; we have reported 3").
3. **Pharma and trial sponsors:** where to place trial sites and diagnostic programmes for patients nobody has found yet. *This is the business model.*
4. **Researchers:** where to run the next sequencing study (largest gap x largest uncertainty).

### 2.3 Why it is new (say this to the judges)
- The existing atlases, and most teams in this challenge, map what is **known**: disease → gene → trial → patient group. UNSEEN maps what is **missing**.
- Researchers publish "genetic prevalence from gnomAD" papers one disease group at a time (neuromuscular, metabolic, retinal). Nobody has turned that method into a global tool that updates itself and turns gaps into decisions.
- It is built on peer-reviewed methods, not a vague AI promise.

---

## 3. The science (implement exactly; deterministic Python)

### 3.1 Scope for v1
- **Autosomal recessive (AR) diseases only.** The formulas below hold for AR. X-linked and dominant diseases are out of scope; say so in the UI.
- **Exclude genes where short-read SNV/indel frequencies are unreliable:** SMN1 (spinal muscular atrophy, deletion-based), FXN (repeat expansion), CYP21A2 and GBA1 (pseudogenes), HBA1/HBA2 (deletions). Show them in the UI as "not estimable with this method", which is honest and looks good to judges.

### 3.2 Pathogenic allele frequency `q`
For gene *g* and gnomAD genetic-ancestry group *a*:

```
q[g,a] = Σ over qualifying variants v of  AC[v,a] / AN[v,a]
```

A variant **qualifies** if:
- ClinVar classifies it as Pathogenic or Likely pathogenic, review status ≥ 1 star, with no conflicting interpretations, **or**
- it is a predicted loss-of-function variant (LOFTEE "HC") in a gene where loss of function is the known disease mechanism. Flag these as `kind = inferred`.
- Cap any single variant at AF ≤ 0.05 (artefact guard), and drop variants that fail gnomAD filters.

**Uncertainty:** treat each variant's AF as Beta(AC+1, AN−AC+1) and draw Monte Carlo samples (n = 2000). Report the median and a 90% interval.

### 3.3 From ancestry to country
gnomAD groups are *genetic ancestry* groups, not countries: `afr, amr, asj, eas, fin, mid, nfe, sas, remaining`.
- Maintain `country_ancestry.json`, which gives each demo country weights over these groups, e.g. Tunisia → mostly `mid` + `nfe` + `afr`. **Every mapping is labelled `kind = inferred`** with a rationale string.
- Country q = weighted sum of group q.
- **Founder-mutation override:** if the Evidence Miner finds a published country-specific frequency for a founder variant (with cohort size), use it in place of the gnomAD-derived value for that variant. Its uncertainty comes from the cohort size, and its provenance is `kind = literature` with the DOI.
- Say it plainly: the `mid` group in gnomAD is small, and ClinVar is biased toward variants found in Europeans, so **our estimates for under-studied populations are probably *underestimates*.** That makes the gap conservative, which strengthens the argument.

### 3.4 Consanguinity and the inbreeding coefficient `F`
The population's average inbreeding coefficient:

```
F_pop = Σ over marriage types t of  rate[t] x F[t]
F[first cousins] = 1/16   F[second cousins] = 1/64
F[double first cousins] = 1/8   F[uncle–niece] = 1/8
```
When only a total "consanguineous marriage %" is available, assume all of those marriages are first cousin (F = 1/16), label it `inferred`, and widen the interval (draw F uniformly between 1/64 and 1/16 x rate).

Source the rates from consang.net (Bittles' global consanguinity database) and recent national surveys found by the Evidence Miner. Cite every rate.

### 3.5 Expected affected births
```
P_affected = q²(1 − F) + q·F        (allows for homozygosity by descent)
expected_births_per_year = P_affected x annual_births[country]
```
- `annual_births` comes from the World Bank API (`SP.DYN.CBRT.IN` crude birth rate x `SP.POP.TOTL`) or UN World Population Prospects. Cite the year.
- The **primary metric** is *expected affected births per year*. Show "expected living patients" only if survival data with a source exists. Otherwise hide it.
- Ignore penetrance in v1, but keep an optional `penetrance` field that defaults to 1 with the note "upper bound".

### 3.6 Reported (diagnosed) patients
This is the weakest input, so be honest about it:
- Use case counts from the literature (Evidence Miner: country, number of patients, years, DOI, exact quote).
- Use Orphanet epidemiology (Orphadata prevalence product) where it gives a value for the country.
- If nothing is found, record **"no published record"**. That is a finding in itself, so show it as an "evidence desert" badge.

### 3.7 Gap metrics
```
gap               = expected_births_per_year x years_window − reported_cases_in_window
visibility_ratio  = reported / expected   (clipped to [0, 1+], show >1 as "over-reported or q underestimated")
```
Use the same time window (e.g. 2005–2025) on both sides. Every displayed number shows its interval.

### 3.8 Panel optimiser
For a country and budget *k* genes: greedily pick the *k* genes that maximise the sum of expected hidden births per year. Output the ranked list, with the cumulative coverage curve as a small chart.

### 3.9 "What would change this estimate"
For each pair, rank the inputs by their contribution to interval width (a one-at-a-time sensitivity check). Example output: *"A Tunisian carrier study of ~500 people for gene X would narrow this interval by about 60%."*

---

## 4. Data sources (cache everything locally; never call live APIs during the demo)

| Need | Source | Access |
|------|--------|--------|
| Variant AC/AN per ancestry, ClinVar overlay, LoF flags | **gnomAD v4** | GraphQL `https://gnomad.broadinstitute.org/api` (gene query → variants with per-population ac/an; `clinvar_variants`). Rate-limited, so pre-fetch the demo genes and store JSON. |
| Pathogenicity | **ClinVar** | `variant_summary.txt.gz` from the NCBI FTP, or via gnomAD's ClinVar overlay |
| Disease ↔ gene ↔ inheritance, prevalence, expert centres, patient organisations | **Orphanet / Orphadata** | Free XML/JSON products (genes, epidemiology, inheritance) at orphadata.com |
| Disease IDs | **MONDO / ORPHA codes** | Use ORPHA code as the primary key, MONDO for cross-reference |
| Consanguinity rates | **consang.net** + literature | Evidence Miner, cited |
| Births | **World Bank API** | `api.worldbank.org/v2/country/{iso}/indicator/SP.DYN.CBRT.IN?format=json` and `SP.POP.TOTL` |
| Recruiting trials by condition and country | **ClinicalTrials.gov API v2** | `https://clinicaltrials.gov/api/v2/studies?query.cond=...&query.locn=...` |
| Genetic test labs by country | **NCBI Genetic Testing Registry (GTR)** | E-utilities `db=gtr` |
| Founder mutations, reported case counts | **Europe PMC / PubMed** | Europe PMC REST search + full text where open access |

> Check exact endpoints, field names and licences in the first hour. If an API differs from the description above, adapt; don't give up on the feature.

---

## 5. Architecture

```
┌──────────────── data pipeline (offline, Python) ────────────────┐
│ fetch_gnomad.py → fetch_clinvar.py → fetch_orphanet.py →        │
│ fetch_worldbank.py → evidence_miner (LLM, cached) → build_graph │
│                         ↓                                        │
│                 data/graph.sqlite  +  data/estimates.json        │
└──────────────────────────────────────────────────────────────────┘
                          ↓
┌──────────── API (FastAPI) ────────────┐   ┌─────── Web (React + Vite + TS) ───────┐
│ /estimates?disease=&country=          │◄──│ World map (MapLibre GL / react-simple- │
│ /panel?country=&k=                    │   │ maps), disease picker, country panel,  │
│ /resources?disease=&country=          │   │ evidence cards, panel optimiser chart, │
│ /ask   (agent loop, OpenAI)           │   │ "Ask the Atlas" chat (+ optional voice)│
└───────────────────────────────────────┘   └────────────────────────────────────────┘
```

### 5.1 Graph and provenance model (SQLite)
```
disease(orpha_code PK, name, inheritance, genes[], estimable BOOL, reason_if_not)
gene(symbol PK, mechanism, notes)
variant(id PK, gene, hgvs, clinvar_class, stars, lof_hc BOOL)
allele_freq(variant_id, ancestry, ac, an, source, retrieved_at)
country(iso3 PK, name, births_per_year, births_source, F_mean, F_low, F_high, F_source)
country_ancestry(iso3, ancestry, weight, rationale, kind='inferred')
founder_variant(iso3, variant_id, freq, cohort_n, doi, quote, kind='literature')
reported_cases(orpha_code, iso3, n, years, doi_or_url, quote, kind)
estimate(orpha_code, iso3, q_med, q_lo, q_hi, expected_med, expected_lo, expected_hi,
         reported, gap_med, gap_lo, gap_hi, visibility, computed_at, method_version)
resource(orpha_code, iso3, type[trial|lab|centre|patient_org], name, url, source)
claim(id, subject, predicate, object, source, retrieved_at, kind)  -- every fact the chat may cite
```

### 5.2 Agents (OpenAI API: use the strongest model the hackathon credits allow, with structured outputs / JSON schema)
1. **Orchestrator:** routes each user question to tools; it never answers on its own.
2. **Evidence Miner (offline, cached):** for each disease x country, searches Europe PMC and extracts `{founder_variant, frequency, cohort_n, reported_case_count, years, country, doi, exact_quote}` as strict JSON. **Rejects** any extraction without an exact quote from the source. A second pass has the model check that each quote actually appears in the fetched text (string match), and discards anything that fails.
3. **Calculator (pure Python tool):** `estimate(disease, country)`, `panel(country, k)`, `sensitivity(disease, country)`. No LLM involved.
4. **Resource Finder (tool):** trials, labs, centres and patient groups from the cached data.
5. **Narrator / "Ask the Atlas":** answers questions **only** from tool outputs and `claim` rows. Every sentence that states a fact ends with a citation chip `[source, kind]`. If no supported link exists, it says *"The atlas has no supported evidence for that. Here is what would change the answer: ..."*. It answers in the language of the question.

Guardrail test: ask it *"What is the best treatment for my son?"* It must decline medical advice and point to the expert centres and patient organisations for that country.

### 5.3 Tech stack (match the team's existing skills)
- **Backend:** Python 3.11, FastAPI, pandas, numpy, httpx, sqlite3, `openai` SDK.
- **Frontend:** React + Vite + TypeScript, Tailwind, MapLibre GL (or react-simple-maps with world-110m TopoJSON), Recharts.
- **Deploy:** frontend on Vercel. API on Render/Railway, or Vercel Python functions with SQLite bundled read-only.
- **Optional voice:** browser Web Speech API for input + TTS for the answer. Keep it a stretch goal.

### 5.4 Repo layout
```
unseen/
  PROMPT.md               ← this file
  README.md               ← pitch, screenshots, how to run, method, limitations
  pipeline/
    fetch_gnomad.py  fetch_clinvar.py  fetch_orphanet.py  fetch_worldbank.py
    evidence_miner.py  build_graph.py  compute_estimates.py
    config/demo_diseases.yaml  config/demo_countries.yaml  config/country_ancestry.json
  api/
    main.py  tools.py  agent.py  models.py
  web/
    src/ (Map.tsx, CountryPanel.tsx, EvidenceCard.tsx, PanelOptimizer.tsx, AskAtlas.tsx)
  data/  (cached raw + graph.sqlite + estimates.json)  ← commit the small processed files so the demo runs offline
  tests/
    test_math.py   ← Hardy–Weinberg + F formula, Monte Carlo sanity, panel greedy
```

---

## 6. Demo scope (be ruthless)

- **~25 AR diseases** where SNV/indel calling is reliable. Candidates to check: phenylketonuria (PAH), cystic fibrosis (CFTR), Wilson disease (ATP7B), Pompe (GAA), MPS I (IDUA), Tay-Sachs (HEXA), xeroderma pigmentosum (XPA/XPC), calpainopathy LGMD R1 (CAPN3), Gaucher **excluded** (GBA1 pseudogene), and SMA **excluded** (SMN1). Add a few more from Orphanet AR genes with good ClinVar coverage.
- **~15 countries**, chosen to contrast high- and low-consanguinity settings and high- and low-resource settings: Tunisia, Morocco, Algeria, Egypt, Saudi Arabia, Pakistan, Sudan, Yemen, Iran, Turkey, India, Nigeria, France, Germany, United States.
- **Hero story for the demo:** one disease, Tunisia vs France. Good candidate: **xeroderma pigmentosum**, where North-African founder mutations are documented in the literature. *The Evidence Miner must confirm the founder variant and cite it before it goes on a slide.* PKU is the fallback hero.

---

## 7. 24-hour build plan

| Hours | Work | Done when |
|-------|------|-----------|
| 0–1 | Confirm brief and submission rules; check APIs; pick the diseases and countries | `demo_diseases.yaml`, `demo_countries.yaml` committed |
| 1–5 | Pipeline: gnomAD + ClinVar fetch and cache; World Bank births; Orphanet genes/epidemiology | Raw JSON cached for all demo genes |
| 3–7 | Math core + tests (q, F, Monte Carlo, panel, sensitivity) | `pytest` green; one estimate printed for Tunisia x hero disease |
| 5–10 | Evidence Miner: founder variants, consanguinity rates, reported cases (quote-verified) | `claim` table populated; zero rows without a quote |
| 8–13 | FastAPI endpoints + agent loop with tools + guardrails | `/ask` answers 5 test questions with citations; refuses the medical-advice question |
| 10–17 | Frontend: map, country panel, evidence cards, panel optimiser, chat | Full flow works on localhost |
| 17–19 | Deploy; seed data committed; offline fallback | Public URL works on a phone |
| 19–21 | README with method, limitations, screenshots | Judges understand it in 60 seconds |
| 21–23 | Record the demo video, rehearse the pitch | ≤ 3 min video, story-first |
| 23–24 | Buffer / polish / submit | Submitted before the deadline |

If behind schedule, cut in this order: voice → sensitivity panel → trials/labs → live chat (keep the pre-computed Q&A).

---

## 8. Demo script (≤ 3 minutes)

1. **Hook (20 s):** "This map shows every rare-disease patient ever reported in North Africa. It's almost empty. Does that mean the patients don't exist? No. It means nobody has found them."
2. **The flip (30 s):** Switch to UNSEEN mode. The map lights up with the *expected* births, and the gap appears.
3. **Drill down (60 s):** Tunisia x hero disease. Expected about N per year (with interval) vs a handful reported. Open the evidence cards: gnomAD frequency (observed), founder mutation (literature, DOI + quote), consanguinity (cited), country ancestry mapping (inferred, explained).
4. **Action (40 s):** Panel optimiser: "A 10-gene panel covers ~X% of Tunisia's expected hidden births." Nearest labs and trials.
5. **Ask the Atlas (20 s):** A question in Arabic or French gets a cited answer, then the medical-advice question gets a polite refusal.
6. **Close (10 s):** "Rare diseases aren't rare where nobody is looking. UNSEEN shows where to look."

---

## 9. Ethics, limits and judge Q&A (put in the README)

- **Consanguinity is cultural, not a moral failing.** Use neutral language and never shame communities. The purpose is to bring services to them.
- **Population estimates only.** Do not treat them as individual risk. No personal data.
- **Known biases:** gnomAD under-represents MENA, sub-Saharan Africa and South Asia; ClinVar is biased toward European variants; the ancestry-to-country mapping is an approximation; penetrance is ignored. These biases mostly make our estimates **too low**, so the real gap is likely larger.
- **Method version** is stamped on every estimate (`method_version`), so results can be reproduced.
- **Likely judge questions:**
  - *"How do you know the numbers are right?"* We validate against countries with good registries (e.g. PKU in Europe, where newborn screening finds nearly every case). Expected and reported should match there. Show that check on a slide.
  - *"Isn't the LLM hallucinating?"* It never produces numbers. Code computes them, and every literature fact has a quote that we verify against the source text.
  - *"Business model?"* Free for ministries and NGOs. Paid for pharma trial-site planning and diagnostic companies' market sizing.

---

## 10. Definition of done
- [ ] Map shows expected, reported and gap for ≥ 20 diseases x ≥ 12 countries
- [ ] Every number has an interval and a provenance badge
- [ ] Validation slide: PKU expected vs reported in ≥ 2 countries with strong newborn screening
- [ ] Panel optimiser works for every country
- [ ] Chat answers with citations in English, French and Arabic, and refuses medical advice
- [ ] README: pitch, method (formulas), data sources, limitations, how to run
- [ ] Public URL + ≤ 3 min demo video + repo submitted
