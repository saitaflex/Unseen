import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Globe2, Map as MapIcon, MessageCircleQuestion, Play, X } from "lucide-react";
import type { Atlas, DiseaseKey, Layer } from "./lib/types";
import { cellsFor, indexPairs, loadAtlas, optimisePanel } from "./lib/data";
import { fmtBig, fmtCount, fmtPct } from "./lib/format";
import { LAYER_META, Legend, WorldMap } from "./components/WorldMap";
import { CountryPanel } from "./components/CountryPanel";
import { PanelOptimizer } from "./components/PanelOptimizer";
import { Leaderboard } from "./components/Leaderboard";
import { AskAtlas } from "./components/AskAtlas";
import { MethodPage } from "./components/MethodPage";

const WEST = new Set(["FRA", "DEU", "GBR", "USA"]);
const LAYERS: Layer[] = ["expected", "rate", "attention", "trials"];

interface UrlState {
  disease: DiseaseKey;
  layer: Layer;
  country: string | null;
}

function readUrl(): UrlState {
  const p = new URLSearchParams(window.location.search);
  const layer = p.get("l") as Layer | null;
  return {
    disease: p.get("d") ?? "all",
    layer: layer && LAYERS.includes(layer) ? layer : "expected",
    country: p.get("c"),
  };
}

interface StoryStep {
  title: string;
  body: string;
  state: Partial<UrlState> & { view?: "focus" | "world"; page?: "atlas" | "method"; ask?: boolean };
}

export default function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(readUrl, []);
  const initialStory = useMemo(() => Number(new URLSearchParams(window.location.search).get("story")), []);
  const [disease, setDisease] = useState<DiseaseKey>(initial.disease);
  const [layer, setLayer] = useState<Layer>(initial.layer);
  const [country, setCountry] = useState<string | null>(initial.country);
  const [view, setView] = useState<"focus" | "world">("focus");
  const [page, setPage] = useState<"atlas" | "method">(window.location.hash === "#method" ? "method" : "atlas");
  const [askOpen, setAskOpen] = useState(false);
  const [story, setStory] = useState<number | null>(null);

  useEffect(() => {
    loadAtlas().then(setAtlas, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const onHash = () => setPage(window.location.hash === "#method" ? "method" : "atlas");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Keep the URL shareable: ?d=pku&c=SDN&l=attention
  useEffect(() => {
    const p = new URLSearchParams();
    if (disease !== "all") p.set("d", disease);
    if (country) p.set("c", country);
    if (layer !== "expected") p.set("l", layer);
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, [disease, country, layer]);

  const index = useMemo(() => (atlas ? indexPairs(atlas) : null), [atlas]);

  // Guard against stale/invalid URL params once data is loaded.
  useEffect(() => {
    if (!atlas) return;
    if (disease !== "all" && !atlas.diseases.some((d) => d.id === disease)) setDisease("all");
    if (country && !atlas.countries.some((c) => c.iso3 === country)) setCountry(null);
  }, [atlas, disease, country]);

  const cells = useMemo(() => (atlas && index ? cellsFor(atlas, index, disease) : []), [atlas, index, disease]);
  const allCells = useMemo(() => (atlas && index ? cellsFor(atlas, index, "all") : []), [atlas, index]);
  const selectedCell = cells.find((c) => c.country.iso3 === country) ?? null;
  const panelGenes = useMemo(() => (atlas && index && country ? optimisePanel(atlas, index, country) : []), [atlas, index, country]);

  const headline = useMemo(() => {
    const tot = allCells.reduce((a, c) => a + c.expected.median, 0);
    const papers = allCells.reduce((a, c) => a + c.papers, 0);
    const restE = allCells.filter((c) => !WEST.has(c.country.iso3)).reduce((a, c) => a + c.expected.median, 0);
    const restP = allCells.filter((c) => !WEST.has(c.country.iso3)).reduce((a, c) => a + c.papers, 0);
    const births = allCells.reduce((a, c) => a + c.country.births.births_per_year, 0);
    return { tot, shareE: tot ? restE / tot : 0, shareP: papers ? restP / papers : 0, births };
  }, [allCells]);

  const storySteps: StoryStep[] = useMemo(
    () => [
      {
        title: "Every year, these children are born",
        body: `Across 18 countries and 22 recessive rare diseases, population genetics expects about ${fmtCount(headline.tot)} affected births a year. Each ring is the expected patients. ${fmtPct(headline.shareE)} of them are born outside Western Europe and the US.`,
        state: { disease: "all", layer: "expected", country: null, view: "focus", page: "atlas" },
      },
      {
        title: "…and here is where the world is looking",
        body: `Switch to research attention: those same countries get only ${fmtPct(headline.shareP)} of the papers. Orange = patients nobody is writing about.`,
        state: { disease: "all", layer: "attention", country: null, view: "focus", page: "atlas" },
      },
      {
        title: "Sudan: a treatable disease, invisible",
        body: "Phenylketonuria is treatable with diet if it's caught at birth. UNSEEN expects hundreds of affected births a year in Sudan, which has a handful of papers and no open trials. Every number links to its source.",
        state: { disease: "pku", layer: "attention", country: "SDN", view: "focus", page: "atlas" },
      },
      {
        title: "Why here? Consanguinity, measured, not judged",
        body: "In Pakistan, half of marriages are between first cousins. The q·F term means most expected cases come from children inheriting the same rare allele twice. Western prevalence figures can't see them.",
        state: { disease: "all", layer: "rate", country: "PAK", view: "focus", page: "atlas" },
      },
      {
        title: "From map to decision",
        body: "Scroll to the action plan: the best 10-gene diagnostic panel for this country, ranked by expected hidden births, with newborn-screening coverage.",
        state: { disease: "all", layer: "rate", country: "PAK", view: "focus", page: "atlas" },
      },
      {
        title: "Validated where the truth is known",
        body: "Where every newborn is screened, UNSEEN's expectations match: Germany for PKU, MCAD and galactosemia, Turkey for PKU. Where it misses (Iran), the method page says why. The same reason is the case for sequencing more people in the region.",
        state: { page: "method" },
      },
      {
        title: "Ask it anything, in your language",
        body: "A ministry officer can ask in Arabic, French or English. Answers come only from the atlas, with citations, and the atlas refuses individual medical advice.",
        state: { page: "atlas", ask: true },
      },
    ],
    [headline],
  );

  const applyStep = useCallback(
    (i: number) => {
      const s = storySteps[i].state;
      if (s.disease !== undefined) setDisease(s.disease);
      if (s.layer !== undefined) setLayer(s.layer);
      if (s.country !== undefined) setCountry(s.country);
      if (s.view) setView(s.view);
      if (s.page) {
        setPage(s.page);
        window.location.hash = s.page === "method" ? "method" : "";
      }
      setAskOpen(Boolean(s.ask));
      setStory(i);
      if (i === 4) setTimeout(() => document.getElementById("action-plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
      else window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [storySteps],
  );

  // Deep link into the guided story (handy for recording the demo): ?story=1..N
  useEffect(() => {
    if (!atlas) return;
    const n = initialStory;
    if (Number.isInteger(n) && n >= 1 && n <= storySteps.length) applyStep(n - 1);
    // run once when data arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas]);

  if (error) {
    return <div className="p-10 text-center text-unseen">Could not load the atlas: {error}</div>;
  }
  if (!atlas || !index) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <img src="/brand/unseen-mark.png" alt="" className="h-16 w-16 animate-pulse" />
        <div className="text-sm text-ink-3">Loading the atlas…</div>
      </div>
    );
  }

  const groups = [...new Set(atlas.diseases.map((d) => d.group))];

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setPage("atlas");
              window.location.hash = "";
            }}
            className="flex items-center gap-3"
            aria-label="UNSEEN home"
          >
            <img src="/brand/unseen-wordmark.png" alt="UNSEEN" className="h-8 w-auto sm:h-9" />
            <span className="hidden border-l border-line pl-3 text-xs leading-tight text-ink-3 md:block">
              The Hidden Patients Atlas
              <br />
              Rare diseases · population genetics
            </span>
          </a>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                const next = page === "method" ? "atlas" : "method";
                setPage(next);
                window.location.hash = next === "method" ? "method" : "";
              }}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:bg-paper-2"
            >
              {page === "method" ? <MapIcon size={16} /> : <BookOpen size={16} />}
              <span className="hidden sm:inline">{page === "method" ? "Atlas" : "Method & sources"}</span>
            </button>
            <button
              onClick={() => applyStep(0)}
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-sm hover:border-brand/50"
            >
              <Play size={15} /> <span className="hidden sm:inline">Play the story</span>
            </button>
            <button
              onClick={() => setAskOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-sm font-medium text-paper shadow-sm hover:bg-brand-deep"
            >
              <MessageCircleQuestion size={16} /> <span className="hidden sm:inline">Ask the Atlas</span>
            </button>
          </div>
        </div>
      </nav>

      {page === "method" ? (
        <MethodPage atlas={atlas} index={index} />
      ) : (
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          {/* Hero */}
          <header className="rise grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-deep">Hack-Nation 7 · AI Atlas for the World's Rare Diseases</div>
              <h1 className="mt-3 font-serif text-[2.6rem] leading-[1.02] sm:text-6xl">
                Every rare-disease map shows where patients have been found.
                <span className="italic text-brand"> This one shows where they haven't.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-ink-2">
                Registries count diagnosed patients, so where there are no geneticists the data says "no disease". UNSEEN uses
                population genetics to estimate how many affected children <em>should</em> be born, then measures how much the world is looking.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <HeroStat value={fmtCount(headline.tot)} label="expected affected births / year" />
              <HeroStat value={fmtPct(headline.shareE)} label="born outside W. Europe & US" accent />
              <HeroStat value={fmtPct(headline.shareP)} label="of the research goes to them" accent />
              <div className="col-span-3 text-[0.7rem] text-ink-3">
                22 diseases × 18 countries · {fmtBig(headline.births)} births/yr · method v{atlas.meta.method_version}
              </div>
            </div>
          </header>

          {/* Controls */}
          <div className="card flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex items-center gap-2 text-sm">
              <span className="shrink-0 text-ink-3">Disease</span>
              <select
                value={disease}
                onChange={(e) => setDisease(e.target.value)}
                className="w-full rounded-full border border-line bg-card px-3.5 py-2 text-sm lg:w-80"
              >
                <option value="all">All 22 diseases (summed)</option>
                {groups.map((g) => (
                  <optgroup key={g} label={g}>
                    {atlas.diseases
                      .filter((d) => d.group === g)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · {d.genes.join("/")}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div role="radiogroup" aria-label="Map layer" className="flex flex-wrap gap-1 rounded-full bg-paper-2 p-1">
              {LAYERS.map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={layer === l}
                  onClick={() => setLayer(l)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
                    layer === l ? "bg-ink text-paper shadow" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {l === "expected" ? "Expected births" : l === "rate" ? "Risk per birth" : l === "attention" ? "Research attention" : "Trial access"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setView(view === "focus" ? "world" : "focus")}
              className="flex items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-sm hover:border-brand/50"
            >
              <Globe2 size={15} /> {view === "focus" ? "Show the US too" : "Focus region"}
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-6 min-w-0">
              <section className="card overflow-hidden p-3 sm:p-5" aria-label="Map">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
                  <h2 className="font-serif text-2xl">{LAYER_META[layer].label}</h2>
                  <span className="text-xs text-ink-3">{disease === "all" ? "All diseases" : atlas.diseases.find((d) => d.id === disease)?.name}</span>
                </div>
                <p className="px-1 text-xs text-ink-3">{LAYER_META[layer].help}</p>
                <WorldMap cells={cells} layer={layer} view={view} selected={country} compare={null} onSelect={setCountry} />
                <div className="px-1 pt-2">
                  <Legend layer={layer} />
                </div>
              </section>

              {country && selectedCell && (
                <div id="action-plan" className="scroll-mt-24">
                  <PanelOptimizer countryName={selectedCell.country.name} genes={panelGenes} />
                </div>
              )}
              {country ? <Leaderboard cells={cells} selected={country} onSelect={setCountry} /> : <HowToRead />}
            </div>

            <div className="space-y-6 min-w-0">
              {selectedCell ? (
                <CountryPanel
                  atlas={atlas}
                  cell={selectedCell}
                  disease={disease}
                  onClose={() => setCountry(null)}
                  onPickDisease={(id) => setDisease(id)}
                />
              ) : (
                <Leaderboard cells={cells} selected={country} onSelect={setCountry} />
              )}
            </div>
          </div>
        </main>
      )}

      <footer className="mt-10 border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <img src="/brand/unseen-mark.png" alt="" className="h-6 w-6" />
            UNSEEN · population-level estimates from open data · not medical advice
          </div>
          <div>gnomAD · ClinVar · Orphanet · World Bank · Europe PMC · ClinicalTrials.gov</div>
        </div>
      </footer>

      {story !== null && (
        <div className={`fixed inset-x-0 bottom-4 z-[60] flex px-4 ${askOpen ? "justify-start pr-[min(32rem,100%)] max-sm:hidden" : "justify-center"}`}>
          <div className="rise card w-full max-w-xl p-4 shadow-2xl" role="dialog" aria-label="Story mode">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-unseen">
                  Story · {story + 1} / {storySteps.length}
                </div>
                <div className="mt-1 font-serif text-2xl leading-tight">{storySteps[story].title}</div>
              </div>
              <button onClick={() => { setStory(null); setAskOpen(false); }} className="rounded-full p-1.5 hover:bg-paper-2" aria-label="Exit story">
                <X size={16} />
              </button>
            </div>
            <p className="mt-1.5 text-sm text-ink-2">{storySteps[story].body}</p>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-1">
                {storySteps.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === story ? "w-6 bg-unseen" : "w-1.5 bg-line"}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={story === 0}
                  onClick={() => applyStep(story - 1)}
                  className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  <ChevronLeft size={15} /> Back
                </button>
                {story < storySteps.length - 1 ? (
                  <button onClick={() => applyStep(story + 1)} className="flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-sm text-paper">
                    Next <ChevronRight size={15} />
                  </button>
                ) : (
                  <button onClick={() => { setStory(null); setAskOpen(false); }} className="rounded-full bg-brand px-3 py-1.5 text-sm text-paper">
                    Explore yourself
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <AskAtlas atlas={atlas} open={askOpen} onClose={() => setAskOpen(false)} disease={disease} country={country} />
    </div>
  );
}

function HeroStat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3.5 ${accent ? "bg-ink text-paper" : "card"}`}>
      <div className={`num text-2xl font-semibold sm:text-3xl ${accent ? "text-[#7fd6b5]" : ""}`}>{value}</div>
      <div className={`mt-1 text-[0.72rem] leading-snug ${accent ? "text-paper/70" : "text-ink-3"}`}>{label}</div>
    </div>
  );
}

function HowToRead() {
  return (
    <section className="card p-5 text-sm">
      <div className="font-serif text-2xl">How to read the atlas</div>
      <ol className="mt-2 space-y-2 text-ink-2">
        <li><strong className="text-ink">Rings</strong> are the patients genetics says exist: expected affected births per year.</li>
        <li><strong className="text-ink">Colour</strong> is the selected layer. Try <em>Research attention</em>: orange means few papers for the burden.</li>
        <li><strong className="text-ink">Click a country</strong> to see the full evidence chain, where every number shows its source and whether it was observed, taken from literature, or inferred.</li>
        <li><strong className="text-ink">Action plan</strong>: the best diagnostic gene panel for that country.</li>
      </ol>
    </section>
  );
}
