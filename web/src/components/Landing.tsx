import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, BadgeCheck, Database, Download, GitBranch, Play, RotateCcw, Wrench } from "lucide-react";
import type { Atlas } from "../lib/types";
import { cellsFor, indexPairs, loadAtlas } from "../lib/data";
import { fmtCount, fmtPct } from "../lib/format";
import { navigate } from "../lib/route";
import { AnimatedLogo } from "./AnimatedLogo";

const WEST = new Set(["FRA", "DEU", "GBR", "USA"]);
const REPO = "https://github.com/saitaflex/Unseen";
const TESTS = 48;

/** Fades a block in when it scrolls into view. */
function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setInView(true), io.disconnect()), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${inView ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Chapter({ n, kicker, title, children, dark }: { n: string; kicker: string; title: ReactNode; children: ReactNode; dark?: boolean }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <Reveal>
        <div className={`flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] ${dark ? "text-[#7fd6b5]" : "text-brand-deep"}`}>
          <span className={`num rounded-full px-2 py-0.5 ${dark ? "bg-paper/10" : "bg-brand-soft"}`}>{n}</span> {kicker}
        </div>
        <h2 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">{title}</h2>
      </Reveal>
      <div className="mt-10">{children}</div>
    </section>
  );
}

export function Landing() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [run, setRun] = useState(0); // bump to replay the intro
  const [skip, setSkip] = useState(false);
  useEffect(() => {
    loadAtlas().then(setAtlas, () => undefined);
  }, []);

  const stats = useMemo(() => {
    if (!atlas) return null;
    const index = indexPairs(atlas);
    const cells = cellsFor(atlas, index, "all");
    const tot = cells.reduce((a, c) => a + c.expected.median, 0);
    const papers = cells.reduce((a, c) => a + c.papers, 0);
    const rest = cells.filter((c) => !WEST.has(c.country.iso3));
    const genes = new Map(atlas.diseases.flatMap((d) => d.genes_detail.map((g) => [g.gene, g.n_qualifying] as const)));
    const alleles = Object.values(atlas.meta.gnomad_alleles).reduce((a, b) => a + b, 0);
    const validation = atlas.validation.flatMap((v) => {
      const p = index.get(`${v.disease}|${v.country}`);
      const d = atlas.diseases.find((x) => x.id === v.disease);
      const c = atlas.countries.find((x) => x.iso3 === v.country);
      if (!p || !d || !c) return [];
      const short: Record<string, string> = { pku: "PKU", mcad: "MCAD", galt: "Galactosemia", cf: "Cystic fibrosis" };
      return [{ label: `${short[d.id] ?? d.name} · ${c.name}`, obs: v.observed_one_in, exp: 1e5 / p.per_100k.median }];
    });
    return {
      tot,
      shareE: rest.reduce((a, c) => a + c.expected.median, 0) / tot,
      shareP: rest.reduce((a, c) => a + c.papers, 0) / papers,
      genes: genes.size,
      variants: [...genes.values()].reduce((a, b) => a + b, 0),
      alleles,
      pairs: atlas.pairs.length,
      validation,
      missed: atlas.countries.reduce((a, c) => a + c.screening_gap.missed_births, 0),
      sudan: index.get("pku|SDN")?.expected_births ?? null,
      covered: atlas.countries.reduce((a, c) => a + c.screening_gap.covered_births, 0),
    };
  }, [atlas]);

  const animate = !skip;
  const delay = (s: number) => ({ animationDelay: animate ? `${s}s` : "0s" });

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ---------- Hero / intro ---------- */}
      <header className="relative flex min-h-[min(100svh,900px)] flex-col items-center justify-center px-5 text-center">
        <div className="absolute right-4 top-4 flex gap-2 sm:right-6 sm:top-6">
          {!skip ? (
            <button onClick={() => setSkip(true)} className="rounded-full px-3 py-1.5 text-xs text-ink-3 hover:bg-paper-2">
              Skip intro
            </button>
          ) : (
            <button
              onClick={() => {
                setSkip(false);
                setRun((r) => r + 1);
              }}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-ink-3 hover:bg-paper-2"
            >
              <RotateCcw size={12} /> Replay
            </button>
          )}
        </div>

        <AnimatedLogo key={run} animate={animate} className="w-[min(560px,86vw)]" />

        <div key={`t${run}`} className="mt-10 max-w-3xl">
          <p className="intro-fade font-display text-2xl font-medium leading-snug text-ink sm:text-4xl" style={delay(3.4)}>
            Every rare-disease map shows where patients <span className="text-ink-3">have been found.</span>
            <br />
            <span className="text-brand">This one shows where they haven't.</span>
          </p>
          <div className="intro-fade mt-8 flex flex-wrap items-center justify-center gap-3" style={delay(3.8)}>
            <button
              onClick={() => navigate("/atlas")}
              className="flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper shadow-lg transition hover:bg-brand-deep"
            >
              Enter the atlas <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate("/atlas?story=1")}
              className="flex items-center gap-2 rounded-full border border-line bg-card px-6 py-3 text-sm font-medium hover:border-brand/50"
            >
              <Play size={15} /> 60-second story
            </button>
          </div>
          <div className="intro-fade mt-5 text-xs text-ink-3" style={delay(4.0)}>
            Hack-Nation 7 · AI Atlas for the World's Rare Diseases
          </div>
        </div>
        <a href="#loop" className="intro-fade absolute bottom-6 text-ink-3 hover:text-ink" style={delay(4.2)} aria-label="Scroll to learn more">
          <ArrowDown className="animate-bounce" size={20} />
        </a>
      </header>

      {/* ---------- 01 The loop ---------- */}
      <div id="loop" className="border-t border-line bg-card/60">
        <Chapter n="01" kicker="The problem" title={<>Registries only count the patients someone already found.</>}>
          <Reveal className="grid items-center gap-10 lg:grid-cols-2">
            <LoopDiagram />
            <p className="font-display text-2xl leading-snug text-ink-2 sm:text-3xl">
              No geneticist means no diagnosis, so the registry says <span className="text-unseen">0</span>, so no tests get funded.
              <span className="mt-4 block text-ink">UNSEEN breaks the loop with math.</span>
            </p>
          </Reveal>
        </Chapter>
      </div>

      {/* ---------- 02 The math ---------- */}
      <Chapter n="02" kicker="The method" title={<>How many children <em className="not-italic text-brand">should</em> be born with each disease?</>}>
        <Reveal>
          <div className="card mx-auto max-w-4xl p-8 text-center sm:p-12">
            <div className="num text-3xl tracking-tight sm:text-5xl">
              P = q²(1 − F) + <span className="rounded-lg bg-unseen-soft px-2 text-unseen">q·F</span>
            </div>
            <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
              <Input sym="q" title="Disease alleles" body={stats ? `gnomAD v4 · ${fmtCount(stats.alleles / 2)} people` : "gnomAD v4"} />
              <Input sym="F" title="Related parents" body="18 national surveys, cited" accent />
              <Input sym="×" title="Births" body="World Bank 2024" />
            </div>
            <p className="mt-6 text-sm text-ink-3">4,000 Monte-Carlo draws, so every number is a range, never a guess.</p>
          </div>
        </Reveal>
      </Chapter>

      {/* ---------- 03 The finding ---------- */}
      <div className="bg-ink text-paper">
        <Chapter dark n="03" kicker="The finding" title={<span className="text-paper">The patients are in one place. The research is in another.</span>}>
          <Reveal className="space-y-8">
            <ShareBar label="Expected affected births" value={stats?.shareE ?? 0} color="#7fd6b5" />
            <ShareBar label="Research papers" value={stats?.shareP ?? 0} color="#e0623a" />
            <p className="font-display text-2xl leading-snug text-paper sm:text-3xl">
              Every year, <span className="num text-[#e0623a]">{stats ? fmtCount(stats.missed) : "…"}</span> of these children are born with a
              disease a heel-prick test can catch, in a country that doesn't test for it.
            </p>
            <p className="text-sm text-paper/60">
              Share in the 14 countries outside Western Europe and the US · {stats ? fmtCount(stats.tot) : "…"} expected births a year ·
              22 diseases × 18 countries
            </p>
          </Reveal>
        </Chapter>
      </div>

      {/* ---------- 04 The proof ---------- */}
      <Chapter n="04" kicker="The proof" title="Checked against countries that screen every newborn.">
        <Reveal>
          <div className="card p-6 sm:p-8">{stats ? <Dumbbell rows={stats.validation} /> : <div className="h-64" />}</div>
          <p className="mt-4 text-sm text-ink-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink align-middle" /> observed by screening ·{" "}
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand align-middle" /> UNSEEN estimate · misses shown, not hidden
          </p>
        </Reveal>
      </Chapter>

      {/* ---------- 05 The AI ---------- */}
      <Chapter n="05" kicker="The AI" title="An AI that shows its work.">
        <Reveal className="grid items-start gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="card space-y-3 p-5 sm:p-6">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-sm text-paper">
              Why is PKU risk so high in Sudan, and is anyone screening?
            </div>
            <div className="space-y-1 rounded-xl bg-paper-2/70 p-2.5">
              {[["get_estimate", "PKU · Sudan"], ["explain_calculation", "PKU · Sudan"], ["country_profile", "Sudan"]].map(([t, a]) => (
                <div key={t} className="flex items-center gap-1.5 text-[0.75rem] text-ink-2">
                  <Wrench size={12} className="text-brand" /> <span className="num font-semibold text-ink">{t}</span> <span className="text-ink-3">{a}</span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl rounded-bl-md border border-line bg-card px-3.5 py-3 text-sm leading-relaxed">
              Genetics expects about <mark className="rounded bg-brand-soft px-1">{stats?.sudan ? fmtCount(stats.sudan.median) : "…"}</mark> affected
              births a year (<mark className="rounded bg-brand-soft px-1">{stats?.sudan ? fmtCount(stats.sudan.p5) : "…"}</mark>–
              <mark className="rounded bg-brand-soft px-1">{stats?.sudan ? fmtCount(stats.sudan.p95) : "…"}</mark>) [1]. Most come from
              related parents: first-cousin marriage is common [2]. No national newborn screening was found, so every one is
              diagnosed late or never [3].
              <div className="mt-2">
                <span className="chip" style={{ background: "#dff1e9", color: "#0f5c46" }}>
                  <BadgeCheck size={11} /> 3/3 numbers verified
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-5">
            {[
              ["7 tools, no memory", "The model reads the atlas only through typed tools. It can't answer from what it remembers."],
              ["Every number checked", "Before you see an answer, each number is matched against the tool results. Anything untraceable is sent back to be fixed, or replaced by the verified offline answer."],
              ["Reads the literature", "A second agent mines papers for founder variants and patient counts, and keeps a finding only if its quote is found word for word in the source."],
              ["Says no when it should", "Individual medical advice is refused, and unmodelled diseases get a straight 'no evidence'."],
            ].map(([t, b]) => (
              <div key={t}>
                <div className="font-display text-xl font-semibold">{t}</div>
                <p className="mt-1 text-ink-2">{b}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </Chapter>

      {/* ---------- 06 Under the hood ---------- */}
      <div className="border-y border-line bg-card/60">
        <Chapter n="06" kicker="Under the hood" title="Open data in, traceable numbers out.">
          <Reveal className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Tile v={stats ? String(stats.genes) : "…"} l="genes" />
            <Tile v={stats ? fmtCount(stats.variants) : "…"} l="pathogenic variants" />
            <Tile v={stats ? String(stats.pairs) : "…"} l="disease × country estimates" />
            <Tile v="7" l="open datasets + cited surveys" />
            <Tile v="1,111" l="regional exomes cross-checked" />
            <Tile v={String(TESTS)} l="automated tests" />
            <Tile v="0" l="numbers written by an LLM" accent />
          </Reveal>
          <Reveal className="mt-8 flex flex-wrap gap-2" delay={120}>
            {["gnomAD", "ClinVar", "GME Variome", "Orphanet", "World Bank", "Europe PMC", "ClinicalTrials.gov", "OpenAI tool calling", "Python · NumPy", "React 19 · TypeScript", "d3-geo", "Vercel"].map((t) => (
              <span key={t} className="chip border border-line bg-paper text-ink-2">{t}</span>
            ))}
          </Reveal>
          <Reveal className="mt-8 flex flex-wrap gap-3" delay={200}>
            <a href="/data/unseen_estimates.csv" download className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-paper hover:bg-brand-deep">
              <Download size={15} /> Download all estimates (CSV)
            </a>
            <a href="/data/atlas.json" download className="flex items-center gap-2 rounded-full border border-line bg-card px-5 py-2.5 text-sm hover:border-brand/50">
              <Database size={15} /> Full atlas (JSON)
            </a>
            <a href={REPO} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-line bg-card px-5 py-2.5 text-sm hover:border-brand/50">
              <GitBranch size={15} /> Source & pipeline
            </a>
          </Reveal>
        </Chapter>
      </div>

      {/* ---------- CTA ---------- */}
      <section className="mx-auto max-w-4xl px-5 py-24 text-center sm:py-32">
        <Reveal>
          <img src="/brand/unseen-mark.png" alt="" className="mx-auto h-16 w-16" />
          <h2 className="mt-6 font-display text-4xl font-semibold tracking-tight sm:text-6xl">
            Rare diseases aren't rare
            <br />
            <span className="text-brand">where nobody is looking.</span>
          </h2>
          <button
            onClick={() => navigate("/atlas")}
            className="mx-auto mt-10 flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-base font-medium text-paper shadow-lg hover:bg-brand-deep"
          >
            Enter the atlas <ArrowRight size={18} />
          </button>
          <p className="mt-6 text-xs text-ink-3">Population-level estimates from open data · not medical advice</p>
        </Reveal>
      </section>
    </div>
  );
}

function Input({ sym, title, body, accent }: { sym: string; title: string; body: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? "bg-unseen-soft" : "bg-paper-2/70"}`}>
      <div className={`num text-2xl font-semibold ${accent ? "text-unseen" : "text-brand-deep"}`}>{sym}</div>
      <div className="mt-1 font-display text-lg font-semibold">{title}</div>
      <div className="text-sm text-ink-3">{body}</div>
    </div>
  );
}

function Tile({ v, l, accent }: { v: string; l: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? "bg-ink text-paper" : "card"}`}>
      <div className={`num text-3xl font-semibold ${accent ? "text-[#7fd6b5]" : ""}`}>{v}</div>
      <div className={`mt-1 text-xs ${accent ? "text-paper/70" : "text-ink-3"}`}>{l}</div>
    </div>
  );
}

function ShareBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-display text-xl sm:text-2xl">{label}</span>
        <span className="num text-5xl font-semibold sm:text-7xl" style={{ color }}>
          {fmtPct(value)}
        </span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-paper/10">
        <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${value * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function LoopDiagram() {
  const nodes = ["No geneticist", "No diagnosis", "Registry: 0", "No tests funded"];
  const R = 120;
  const C = 160;
  return (
    <svg viewBox="-80 0 480 320" className="mx-auto w-full max-w-md" role="img" aria-label="The loop: no geneticist, no diagnosis, registry shows zero, no tests funded">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#75817b" />
        </marker>
      </defs>
      <circle cx={C} cy={C} r={R} fill="none" stroke="#e4ddd2" strokeWidth={2} strokeDasharray="4 6" />
      {nodes.map((_, i) => {
        const a0 = (i / 4) * 2 * Math.PI - Math.PI / 2 + 0.38;
        const a1 = ((i + 1) / 4) * 2 * Math.PI - Math.PI / 2 - 0.38;
        return (
          <path
            key={`a${i}`}
            d={`M${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A${R} ${R} 0 0 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)}`}
            fill="none"
            stroke="#75817b"
            strokeWidth={1.6}
            markerEnd="url(#arr)"
          />
        );
      })}
      {nodes.map((t, i) => {
        const a = (i / 4) * 2 * Math.PI - Math.PI / 2;
        const x = C + R * Math.cos(a);
        const y = C + R * Math.sin(a);
        return (
          <g key={t}>
            <circle cx={x} cy={y} r={7} fill={i === 2 ? "#e0623a" : "#259978"} />
            <text x={x} y={y + (i === 0 ? -16 : i === 2 ? 26 : 4)} dx={i === 1 ? 14 : i === 3 ? -14 : 0} textAnchor={i === 1 ? "start" : i === 3 ? "end" : "middle"} fontSize={13} fontWeight={600} fill="#13201b" fontFamily="Outfit, sans-serif">
              {t}
            </text>
          </g>
        );
      })}
      <circle cx={C} cy={C} r={30} fill="none" stroke="#259978" strokeWidth={6} />
      <text x={C} y={C + 58} textAnchor="middle" fontSize={11} fill="#75817b">the unseen patient</text>
    </svg>
  );
}

/** Observed (hollow, like the logo's open circle) vs estimated (filled dot) on a log "1 in N" axis. */
function Dumbbell({ rows }: { rows: { label: string; obs: [number, number]; exp: number }[] }) {
  const lo = 1000;
  const hi = 100000;
  const x = (v: number) => ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * 100;
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[7.5rem_1fr] items-center gap-3 sm:grid-cols-[11rem_1fr]">
          <div className="truncate text-sm font-medium">{r.label}</div>
          <div className="relative h-6">
            <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
            {r.obs[0] !== r.obs[1] && (
              <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-ink/15" style={{ left: `${x(r.obs[0])}%`, width: `${x(r.obs[1]) - x(r.obs[0])}%` }} />
            )}
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 bg-brand/40"
              style={{
                left: `${Math.min(x(r.exp), x(Math.sqrt(r.obs[0] * r.obs[1])))}%`,
                width: `${Math.abs(x(r.exp) - x(Math.sqrt(r.obs[0] * r.obs[1])))}%`,
              }}
            />
            <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink bg-card" style={{ left: `${x(Math.sqrt(r.obs[0] * r.obs[1]))}%` }} title={`observed 1 in ${r.obs.join("–")}`} />
            <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" style={{ left: `${x(r.exp)}%` }} title={`UNSEEN 1 in ${Math.round(r.exp)}`} />
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[7.5rem_1fr] gap-3 sm:grid-cols-[11rem_1fr]">
        <div />
        <div className="num flex justify-between text-[0.7rem] text-ink-3">
          <span>1 in 1,000</span>
          <span>1 in 10,000</span>
          <span>1 in 100,000</span>
        </div>
      </div>
    </div>
  );
}
