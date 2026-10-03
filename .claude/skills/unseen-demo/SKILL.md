---
name: unseen-demo
description: Run, deploy and present the UNSEEN demo — local preview, Vercel deploy, story-mode deep links, 3-minute pitch script. Use when asked to demo, deploy, record a video, or prepare the pitch.
---

# UNSEEN demo

## Run / deploy
- Local: `cd web && npm run dev`, or `npm run build && npx vite preview`.
- Vercel: `cd web && npx vercel --prod` (Vite framework, output `dist`, function `api/agent.ts`).
  Env `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`) turns on the tool-calling agent; without it the offline grounded engine answers.
- On Windows use PowerShell for CLI args that start with `/` (Git Bash rewrites them).

## Deep links for recording
- `?story=1` … `?story=7`: guided story steps
- `?d=pku&c=SDN&l=attention`: PKU in Sudan, research-attention layer
- `?c=PAK&l=rate`: Pakistan, all diseases, action plan
- `/atlas?d=pku&c=TUN&calc=1`: opens the full step-by-step calculation
- `/atlas?l=screening`: newborn screening gap layer
- `/atlas#method`: method, 17 formulas, validation, sources

## 3-minute pitch
1. Hook: "Every rare-disease map shows where patients have been found. This one shows where they haven't."
2. The flip: expected births (story 1) and then research attention (story 2): 91% of expected patients, 37% of papers.
3. Sudan PKU (story 3): hundreds of expected births a year, 2 papers, 0 trials. Open the evidence chain.
4. Why: consanguinity, measured and not judged (story 4). Then the action plan (story 5).
5. Trust: validation against German and Turkish newborn screening, plus the honest Iran miss (story 6).
6. Ask in Arabic, then the medical-advice question gets refused (story 7).
7. Close: "Rare diseases aren't rare where nobody is looking."

Rules for any change: never put a number on a slide that the app can't trace to a source.
