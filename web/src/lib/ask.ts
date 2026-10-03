/**
 * Grounded question answering over the atlas. Deterministic: it never invents a number —
 * every figure comes from atlas.json, and every answer carries its citations.
 * The optional LLM narrator (/api/ask) may only rephrase these facts.
 */
import type { Atlas, Pair } from "./types";
import { cellsFor, indexPairs, optimisePanel, unseenScore } from "./data";
import { fmtCount, fmtOneIn, fmtPct, fmtRatio } from "./format";

export type Lang = "en" | "fr" | "ar";

export interface Citation {
  label: string;
  url: string;
  kind: "observed" | "literature" | "inferred" | "computed";
}

export interface Answer {
  lang: Lang;
  text: string;
  citations: Citation[];
  refused?: boolean;
  facts: Record<string, unknown>;
  /** The tools this answer was built from (shown in the UI as the reasoning trace). */
  tools?: { name: string; args: Record<string, unknown> }[];
}

const COUNTRY_WORDS: Record<string, string[]> = {
  TUN: ["tunisia", "tunisian", "tunisie", "tunisien", "تونس"],
  MAR: ["morocco", "moroccan", "maroc", "marocain", "المغرب"],
  DZA: ["algeria", "algerian", "algérie", "algerie", "algérien", "الجزائر"],
  LBY: ["libya", "libyan", "libye", "ليبيا"],
  EGY: ["egypt", "egyptian", "égypte", "egypte", "مصر"],
  SDN: ["sudan", "sudanese", "soudan", "السودان"],
  SAU: ["saudi", "arabie saoudite", "السعودية"],
  YEM: ["yemen", "yemeni", "yémen", "اليمن"],
  JOR: ["jordan", "jordanian", "jordanie", "الأردن", "الاردن"],
  IRQ: ["iraq", "iraqi", "irak", "العراق"],
  PAK: ["pakistan", "pakistani", "باكستان"],
  IRN: ["iran", "iranian", "إيران", "ايران"],
  TUR: ["turkey", "turkish", "turquie", "türkiye", "تركيا"],
  IND: ["india", "indian", "inde", "الهند"],
  FRA: ["france", "french", "français", "فرنسا"],
  DEU: ["germany", "german", "allemagne", "ألمانيا", "المانيا"],
  GBR: ["united kingdom", "uk", "britain", "british", "royaume-uni", "بريطانيا", "المملكة المتحدة"],
  USA: ["united states", "usa", "america", "états-unis", "etats-unis", "أمريكا", "الولايات المتحدة"],
};

const DISEASE_WORDS: Record<string, string[]> = {
  pku: ["pku", "phenylketonuria", "phénylcétonurie", "phenylcetonurie", "بيلة الفينيل", "فينيل كيتون"],
  cf: ["cystic fibrosis", "mucoviscidose", "التليف الكيسي", "cftr"],
  wilson: ["wilson", "ويلسون"],
  pompe: ["pompe", "بومبي"],
  mps1: ["mps i", "mps1", "hurler", "mucopolysaccharidosis type i", "mucopolysaccharidose"],
  taysachs: ["tay-sachs", "tay sachs", "تاي ساكس"],
  sandhoff: ["sandhoff"],
  mld: ["metachromatic", "leucodystrophie métachromatique", "mld"],
  krabbe: ["krabbe"],
  npc: ["niemann", "npc1"],
  xp: ["xeroderma", "xéroderma", "جفاف الجلد المصطبغ", "moon children", "enfants de la lune", "أطفال القمر"],
  at: ["ataxia-telangiectasia", "ataxia telangiectasia", "ataxie-télangiectasie", "atm"],
  lgmdr1: ["calpain", "lgmd", "capn3"],
  msud: ["maple syrup", "msud", "sirop d'érable", "داء البول القيقبي"],
  galt: ["galactosemia", "galactosémie", "galactosemie", "الجالاكتوز"],
  hcu: ["homocystinuria", "homocystinurie"],
  mcad: ["mcad"],
  ga1: ["glutaric", "glutarique"],
  pa: ["propionic", "propionique"],
  mma: ["methylmalonic", "méthylmalonique"],
  ph1: ["hyperoxaluria", "hyperoxalurie", "agxt"],
  dfnb1: ["deafness", "hearing", "surdité", "gjb2", "connexin", "الصمم"],
};

/** Short ASCII tokens (pku, uk, atm, inde…) must match as whole words, or "treatment" would match "atm". */
const has = (q: string, words: string[]) =>
  words.some((w) =>
    w.length <= 4 && /^[a-z0-9]+$/.test(w) ? new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(q) : q.includes(w),
  );

export function detectLang(q: string): Lang {
  if (/[؀-ۿ]/.test(q)) return "ar";
  const fr = ["combien", "quels", "quelle", "pourquoi", "maladie", "essais", "gènes", "enfants", "naissances", "dépistage", "est-ce", " le ", " la ", " les ", " des ", " en "];
  return fr.filter((w) => ` ${q} `.includes(w)).length >= 2 ? "fr" : "en";
}

function detect(qRaw: string) {
  const q = qRaw.toLowerCase();
  const country = Object.entries(COUNTRY_WORDS).find(([, ws]) => has(q, ws))?.[0] ?? null;
  const diseaseMentioned = Object.entries(DISEASE_WORDS).find(([, ws]) => has(q, ws))?.[0] ?? null;
  const medical = has(q, [
    "treatment", "treat ", "cure", "medicine for", "my son", "my daughter", "my child", "my baby", "should i take", "dose",
    "traitement", "soigner", "guérir", "mon fils", "ma fille", "mon enfant", "mon bébé",
    "علاج", "ابني", "ابنتي", "طفلي", "دواء",
  ]);
  const intent = medical
    ? "medical"
    : has(q, ["how is", "how was", "how did", "explain", "calculat", "show the math", "formula", "comment est", "calcul", "كيف", "حساب"])
      ? "explain"
      : has(q, ["newborn screening", "screening program", "screening programme", "does it screen", "screened", "dépistage néonatal", "فحص المواليد", "فحص حديثي الولادة"])
        ? "screening"
    : has(q, ["panel", "test", "screen", "which genes", "dépistage", "gènes", "فحص", "جينات", "الجينات"])
      ? "panel"
      : has(q, ["trial", "essai", "تجارب", "تجربة"])
        ? "trials"
        : has(q, ["why", "pourquoi", "لماذا", "consanguin", "cousin", "قرابة", "أقارب"])
          ? "why"
          : has(q, ["most", "where", "worst", "rank", "où", "plus", "أين", "أكثر"]) && !country
            ? "rank"
            : "count";
  // Words that look like a disease but are not modelled → honest "no evidence" answer.
  const unknownDisease =
    !diseaseMentioned &&
    has(q, ["sma", "spinal muscular", "friedreich", "gaucher", "huntington", "duchenne", "thalassemia", "thalassémie", "sickle", "drépanocytose", "fmf", "mediterranean fever"]);
  return { country, disease: diseaseMentioned, intent, unknownDisease, q };
}

const T = {
  count: {
    en: (d: string, c: string, e: string, lo: string, hi: string, oneIn: string, att: string, papers: number) =>
      `Population genetics expects about **${e} children with ${d}** to be born in **${c}** each year (90% interval ${lo}–${hi}; ${oneIn} births). The world has published **${papers}** papers on ${d} in ${c} — research attention is **${att}** of what its burden would predict.`,
    fr: (d: string, c: string, e: string, lo: string, hi: string, oneIn: string, att: string, papers: number) =>
      `La génétique des populations prévoit environ **${e} enfants atteints de ${d}** nés chaque année en **${c}** (intervalle à 90 % : ${lo}–${hi} ; ${oneIn.replace("1 in", "1 sur")} naissances). **${papers}** articles publiés concernent ${d} en ${c} — l'attention de la recherche vaut **${att}** de ce que le fardeau prédirait.`,
    ar: (d: string, c: string, e: string, lo: string, hi: string, oneIn: string, att: string, papers: number) =>
      `تتوقع علوم الوراثة السكانية ولادة نحو **${e} طفلًا مصابًا بـ ${d}** كل عام في **${c}** (فترة ثقة 90%: ${lo}–${hi}؛ ${oneIn.replace("1 in", "1 من كل")} ولادة). نُشرت **${papers}** ورقة بحثية فقط عن ${d} في ${c} — أي أن الاهتمام البحثي يساوي **${att}** مما يتطلبه حجم العبء.`,
  },
  why: {
    en: (c: string, share: string, F: string) =>
      `In **${c}**, ${share} of expected cases come from the inbreeding term (q·F): when parents are related, a child can inherit the *same* rare allele from a shared ancestor. The population inbreeding coefficient is F ≈ ${F}. This is a cultural practice, not a fault — but it means Western prevalence numbers badly under-count patients here.`,
    fr: (c: string, share: string, F: string) =>
      `En **${c}**, ${share} des cas attendus proviennent du terme de consanguinité (q·F) : quand les parents sont apparentés, l'enfant peut hériter du *même* allèle rare d'un ancêtre commun. Le coefficient de consanguinité moyen est F ≈ ${F}. C'est une pratique culturelle, pas une faute — mais les chiffres de prévalence occidentaux sous-estiment fortement les patients ici.`,
    ar: (c: string, share: string, F: string) =>
      `في **${c}**، تأتي ${share} من الحالات المتوقعة من عامل زواج الأقارب (q·F): عندما يكون الوالدان أقارب، قد يرث الطفل *نفس* الأليل النادر من جد مشترك. معامل التزاوج الداخلي السكاني F ≈ ${F}. إنها ممارسة ثقافية وليست خطأ — لكنها تعني أن أرقام الانتشار الغربية تقلل كثيرًا من عدد المرضى هنا.`,
  },
  panel: {
    en: (c: string, list: string, pct: string) => `For **${c}**, the 10 genes covering the most expected hidden births are: ${list}. Together they cover **${pct}** of the modelled burden.`,
    fr: (c: string, list: string, pct: string) => `Pour **${c}**, les 10 gènes couvrant le plus de naissances cachées attendues sont : ${list}. Ensemble, ils couvrent **${pct}** du fardeau modélisé.`,
    ar: (c: string, list: string, pct: string) => `في **${c}**، الجينات العشرة التي تغطي أكبر عدد من الولادات المخفية المتوقعة هي: ${list}. تغطي معًا **${pct}** من العبء المُنمذج.`,
  },
  trials: {
    en: (d: string, c: string, n: number, e: string) => `There are **${n}** recruiting or upcoming trials for ${d} with a site in **${c}**, for about ${e} expected affected births per year.`,
    fr: (d: string, c: string, n: number, e: string) => `Il y a **${n}** essais en recrutement ou à venir pour ${d} avec un site en **${c}**, pour environ ${e} naissances atteintes attendues par an.`,
    ar: (d: string, c: string, n: number, e: string) => `هناك **${n}** تجربة سريرية جارية أو قادمة لـ ${d} لها موقع في **${c}**، مقابل نحو ${e} ولادة مصابة متوقعة سنويًا.`,
  },
  rank: {
    en: (d: string, list: string) => `Where ${d} patients are most likely unseen (large expected burden, little research): ${list}.`,
    fr: (d: string, list: string) => `Là où les patients (${d}) sont le plus probablement invisibles (fardeau attendu élevé, peu de recherche) : ${list}.`,
    ar: (d: string, list: string) => `أين يُرجَّح أن يكون مرضى ${d} غير مرئيين (عبء متوقع كبير وبحث قليل): ${list}.`,
  },
  medical: {
    en: "I can't give medical advice about a specific person — UNSEEN only makes population-level estimates. Please talk to a clinical geneticist. Orphanet lists expert centres and patient organisations for this disease:",
    fr: "Je ne peux pas donner d'avis médical sur une personne — UNSEEN ne produit que des estimations à l'échelle des populations. Consultez un généticien clinicien. Orphanet répertorie les centres experts et associations de patients :",
    ar: "لا يمكنني تقديم نصيحة طبية لشخص بعينه — UNSEEN يقدّم تقديرات على مستوى السكان فقط. يُرجى استشارة طبيب وراثة سريرية. يسرد Orphanet المراكز المتخصصة وجمعيات المرضى:",
  },
  unknown: {
    en: "The atlas has **no supported evidence** for that disease. UNSEEN currently models 22 autosomal-recessive diseases whose variants short-read data captures well; diseases caused mainly by deletions or repeat expansions (e.g. SMA, Friedreich ataxia) are deliberately excluded. What would change this: deletion-aware population data (e.g. long-read or CNV calls) for the relevant genes.",
    fr: "L'atlas n'a **aucune preuve étayée** pour cette maladie. UNSEEN modélise 22 maladies récessives bien captées par les données de séquençage court ; les maladies dues surtout à des délétions ou expansions (ex. SMA, ataxie de Friedreich) sont exclues volontairement. Ce qui changerait la réponse : des données de population capables de détecter les délétions.",
    ar: "لا يملك الأطلس **أي دليل موثّق** لهذا المرض. يغطي UNSEEN حاليًا 22 مرضًا متنحيًا تلتقطها بيانات التسلسل القصير جيدًا؛ الأمراض الناتجة أساسًا عن حذف جيني أو تكرارات (مثل SMA ورنح فريدريك) مستبعدة عمدًا. ما قد يغيّر الإجابة: بيانات سكانية قادرة على كشف الحذف الجيني.",
  },
  explain: {
    en: (d: string, c: string, steps: string, exp: string, mc: string) =>
      `How UNSEEN gets ${d} in **${c}**: ${steps} So P × births = **${exp}** affected births a year (simulation median ${mc}).`,
    fr: (d: string, c: string, steps: string, exp: string, mc: string) =>
      `Comment UNSEEN calcule ${d} en **${c}** : ${steps} Donc P × naissances = **${exp}** naissances atteintes par an (médiane de simulation ${mc}).`,
    ar: (d: string, c: string, steps: string, exp: string, mc: string) =>
      `كيف يحسب UNSEEN ${d} في **${c}**: ${steps} إذن P × الولادات = **${exp}** ولادة مصابة سنويًا (وسيط المحاكاة ${mc}).`,
  },
  screening: {
    en: (c: string, status: string, covered: string, missed: string, list: string) =>
      `**${c}**: ${status}. Its programme reaches about **${covered}** expected affected births a year; **${missed}** more are born each year with blood-spot-detectable diseases it does not screen for${list ? ` (${list})` : ""}.`,
    fr: (c: string, status: string, covered: string, missed: string, list: string) =>
      `**${c}** : ${status}. Le programme couvre environ **${covered}** naissances atteintes attendues par an ; **${missed}** autres naissent chaque année avec des maladies dépistables non couvertes${list ? ` (${list})` : ""}.`,
    ar: (c: string, status: string, covered: string, missed: string, list: string) =>
      `**${c}**: ${status}. يغطي البرنامج نحو **${covered}** ولادة مصابة متوقعة سنويًا؛ ويولد **${missed}** آخرون كل عام بأمراض قابلة للكشف لا يشملها الفحص${list ? ` (${list})` : ""}.`,
  },
  needCountry: {
    en: "Which country? Try: “How many PKU babies are born in Tunisia each year?”",
    fr: "Quel pays ? Essayez : « Combien d'enfants atteints de PCU naissent en Tunisie chaque année ? »",
    ar: "أي بلد؟ جرّب: «كم طفلًا مصابًا ببيلة الفينيل كيتون يولد في تونس سنويًا؟»",
  },
};

const COUNTRY_AR: Record<string, string> = {
  TUN: "تونس", MAR: "المغرب", DZA: "الجزائر", LBY: "ليبيا", EGY: "مصر", SDN: "السودان", SAU: "السعودية", YEM: "اليمن",
  JOR: "الأردن", IRQ: "العراق", PAK: "باكستان", IRN: "إيران", TUR: "تركيا", IND: "الهند", FRA: "فرنسا", DEU: "ألمانيا",
  GBR: "المملكة المتحدة", USA: "الولايات المتحدة",
};
const COUNTRY_FR: Record<string, string> = {
  TUN: "Tunisie", MAR: "Maroc", DZA: "Algérie", LBY: "Libye", EGY: "Égypte", SDN: "Soudan", SAU: "Arabie saoudite", YEM: "Yémen",
  JOR: "Jordanie", IRQ: "Irak", PAK: "Pakistan", IRN: "Iran", TUR: "Turquie", IND: "Inde", FRA: "France", DEU: "Allemagne",
  GBR: "Royaume-Uni", USA: "États-Unis",
};

/** Grounded answer plus the tool trace it was built from. */
export function answer(atlas: Atlas, question: string, fallbackDisease: string | "all", fallbackCountry: string | null): Answer {
  const a = answerCore(atlas, question, fallbackDisease, fallbackCountry);
  if (a.tools || a.refused) return a;
  const { country, disease, intent } = detect(question);
  const c = country ?? fallbackCountry;
  const d = disease ?? (fallbackDisease === "all" ? "pku" : fallbackDisease);
  const tool =
    intent === "panel" ? { name: "diagnostic_panel", args: { country: c, k: 10 } }
      : intent === "rank" || !c ? { name: "rank_countries", args: { disease: d, metric: "unseen" } }
        : { name: "get_estimate", args: { disease: d, country: c } };
  return { ...a, tools: a.text ? [tool] : [] };
}

function answerCore(atlas: Atlas, question: string, fallbackDisease: string | "all", fallbackCountry: string | null): Answer {
  const lang = detectLang(question);
  const { country: cDetected, disease: dDetected, intent, unknownDisease } = detect(question);
  const index = indexPairs(atlas);
  const iso = cDetected ?? fallbackCountry;
  const dId = dDetected ?? (fallbackDisease === "all" ? "pku" : fallbackDisease);
  const disease = atlas.diseases.find((d) => d.id === dId)!;
  const country = iso ? atlas.countries.find((c) => c.iso3 === iso) ?? null : null;
  const cName = country ? (lang === "ar" ? COUNTRY_AR[country.iso3] : lang === "fr" ? COUNTRY_FR[country.iso3] : country.name) : "";
  const methodCite: Citation = { label: "UNSEEN method (P = q²(1−F) + qF)", url: "#method", kind: "computed" };

  if (intent === "medical") {
    return {
      lang,
      refused: true,
      text: T.medical[lang],
      citations: [{ label: `Orphanet: ${disease.orphanet.preferred_term}`, url: disease.orphanet.url, kind: "literature" }],
      facts: { refused: true },
    };
  }
  if (unknownDisease) {
    return { lang, text: T.unknown[lang], citations: [methodCite], facts: { unknown: true } };
  }
  if (intent === "rank" || !country) {
    if (intent !== "rank" && !country) return { lang, text: T.needCountry[lang], citations: [], facts: {} };
    const cells = cellsFor(atlas, index, dId).sort((a, b) => unseenScore(b) - unseenScore(a)).slice(0, 5);
    const list = cells
      .map((c) => {
        const nm = lang === "ar" ? COUNTRY_AR[c.country.iso3] : lang === "fr" ? COUNTRY_FR[c.country.iso3] : c.country.name;
        return `**${nm}** (${fmtCount(c.expected.median)}/yr, ${fmtRatio(c.attention)})`;
      })
      .join(", ");
    return {
      lang,
      text: T.rank[lang](disease.name, list),
      citations: [methodCite, { label: "Europe PMC (paper counts)", url: "https://europepmc.org", kind: "observed" }],
      facts: { ranking: cells.map((c) => ({ country: c.country.name, expected: c.expected.median, attention: c.attention })) },
    };
  }

  const pair = index.get(`${dId}|${country.iso3}`) as Pair;
  const geneCites: Citation[] = disease.genes_detail.map((g) => ({ label: `gnomAD v4 · ${g.gene}`, url: g.url, kind: "observed" }));
  const birthsCite: Citation = { label: `World Bank births ${country.births.cbr_year}`, url: country.births.url, kind: "observed" };
  const consCite: Citation = { label: country.consanguinity.source.label, url: country.consanguinity.source.url, kind: country.consanguinity.first_cousin_kind === "literature" ? "literature" : "inferred" };

  if (intent === "explain") {
    const t = pair.trace;
    const g = t.genes
      .map((x) => `${x.gene}: q = ${x.groups.map((gr) => `${gr.weight}×${gr.q_hat.toExponential(2)} (${gr.group})`).join(" + ")} = ${x.q.toExponential(2)}`)
      .join("; ");
    const steps = `${g}. F = ${t.F.first_cousin_pct.toFixed(1)}% first cousins ÷ 16 + ${t.F.other_pct.toFixed(1)}% other ÷ 64 = ${t.F.F.toFixed(4)}. P = q²(1−F) + q·F = ${t.P.toExponential(3)}; births = ${t.births.toLocaleString("en-US")}.`;
    return {
      lang,
      text: T.explain[lang](disease.name, cName, steps, fmtCount(t.expected), fmtCount(t.mc.median)),
      citations: [...geneCites, consCite, birthsCite, methodCite],
      facts: { trace: t },
      tools: [{ name: "explain_calculation", args: { disease: dId, country: country.iso3 } }],
    };
  }
  if (intent === "screening") {
    const names = country.screening_gap.missed_diseases.map((id) => atlas.diseases.find((d) => d.id === id)?.name ?? id);
    return {
      lang,
      text: T.screening[lang](cName, country.screening.status, fmtCount(country.screening_gap.covered_births), fmtCount(country.screening_gap.missed_births), names.slice(0, 6).join(", ")),
      citations: [{ label: country.screening.src.label, url: country.screening.src.url, kind: country.screening.kind === "literature" ? "literature" : "inferred" }, methodCite],
      facts: { screening: country.screening, gap: country.screening_gap },
      tools: [{ name: "country_profile", args: { country: country.iso3 } }],
    };
  }
  if (intent === "panel") {
    const genes = optimisePanel(atlas, index, country.iso3);
    const total = genes.reduce((a, g) => a + g.expected, 0);
    const top = genes.slice(0, 10);
    const covered = top.reduce((a, g) => a + g.expected, 0);
    return {
      lang,
      text: T.panel[lang](cName, top.map((g) => `${g.gene} (${fmtCount(g.expected)}/yr)`).join(", "), fmtPct(total ? covered / total : 0)),
      citations: [methodCite, birthsCite, consCite],
      facts: { panel: top },
    };
  }
  if (intent === "trials") {
    return {
      lang,
      text: T.trials[lang](disease.name, cName, pair.trials.open_trials, fmtCount(pair.expected_births.median)),
      citations: [{ label: "ClinicalTrials.gov search", url: pair.trials.url, kind: "observed" }, methodCite],
      facts: { trials: pair.trials.open_trials, expected: pair.expected_births },
    };
  }
  if (intent === "why") {
    return {
      lang,
      text: T.why[lang](cName, fmtPct(pair.consanguinity_share), country.consanguinity.F.median.toFixed(4)),
      citations: [consCite, methodCite],
      facts: { consanguinity_share: pair.consanguinity_share, F: country.consanguinity.F },
    };
  }
  return {
    lang,
    text: T.count[lang](
      disease.name,
      cName,
      fmtCount(pair.expected_births.median),
      fmtCount(pair.expected_births.p5),
      fmtCount(pair.expected_births.p95),
      fmtOneIn(pair.per_100k.median),
      fmtRatio(pair.attention_ratio),
      pair.papers.papers,
    ),
    citations: [...geneCites, consCite, birthsCite, { label: "Europe PMC query", url: pair.papers.url, kind: "observed" }, methodCite],
    facts: { expected_births: pair.expected_births, per_100k: pair.per_100k, attention_ratio: pair.attention_ratio, papers: pair.papers.papers },
  };
}
