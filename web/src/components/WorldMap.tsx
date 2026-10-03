import { useMemo, useState } from "react";
import { geoCentroid, geoNaturalEarth1, geoPath } from "d3-geo";
import { scaleLog, scaleSqrt } from "d3-scale";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import type { CellView, Layer } from "../lib/types";
import { layerValue } from "../lib/data";
import { fmtCount, fmtOneIn, fmtRatio } from "../lib/format";

/** ISO 3166 numeric (world-atlas ids) → ISO3 for the countries we model. */
const NUMERIC_TO_ISO3: Record<string, string> = {
  "788": "TUN", "504": "MAR", "012": "DZA", "434": "LBY", "818": "EGY", "729": "SDN",
  "682": "SAU", "887": "YEM", "400": "JOR", "368": "IRQ", "586": "PAK", "364": "IRN",
  "792": "TUR", "356": "IND", "250": "FRA", "276": "DEU", "826": "GBR", "840": "USA",
};

type CountryFeature = Feature<Geometry, { name: string }>;

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const ALL_FEATURES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>)
  .features as CountryFeature[];

const W = 960;
const H = 520;

export const LAYER_META: Record<Layer, { label: string; legendLow: string; legendHigh: string; help: string }> = {
  expected: {
    label: "Expected affected births / year",
    legendLow: "fewer",
    legendHigh: "more",
    help: "How many children with these diseases population genetics says are born each year.",
  },
  rate: {
    label: "Risk per 100,000 births",
    legendLow: "lower",
    legendHigh: "higher",
    help: "Expected affected births per 100k births: genetics × consanguinity, independent of population size.",
  },
  attention: {
    label: "Research attention vs. burden",
    legendLow: "under-studied",
    legendHigh: "over-studied",
    help: "Share of published papers ÷ share of expected patients. 1× = research matches burden. Below 1× = patients nobody is writing about.",
  },
  trials: {
    label: "Open trials per 100 expected births",
    legendLow: "trial desert",
    legendHigh: "more access",
    help: "Recruiting trials with a site in the country, per 100 expected affected births per year.",
  },
};

interface Props {
  cells: CellView[];
  layer: Layer;
  view: "focus" | "world";
  selected: string | null;
  compare: string | null;
  onSelect: (iso3: string) => void;
}

export function WorldMap({ cells, layer, view, selected, compare, onSelect }: Props) {
  const [hover, setHover] = useState<{ iso3: string; x: number; y: number; flip: boolean } | null>(null);
  const byIso = useMemo(() => new Map(cells.map((c) => [c.country.iso3, c])), [cells]);

  const { path, projection } = useMemo(() => {
    const modelled = ALL_FEATURES.filter((f) => {
      const iso = NUMERIC_TO_ISO3[String(f.id)];
      return iso && (view === "world" || iso !== "USA");
    });
    const target: FeatureCollection =
      view === "world"
        ? { type: "FeatureCollection", features: ALL_FEATURES.filter((f) => String(f.id) !== "010") }
        : { type: "FeatureCollection", features: modelled };
    const proj = geoNaturalEarth1().fitExtent(
      [
        [16, 16],
        [W - 16, H - 16],
      ],
      target,
    );
    return { path: geoPath(proj), projection: proj };
  }, [view]);

  const color = useMemo(() => {
    const values = cells.map((c) => layerValue(c, layer)).filter((v): v is number => v !== null && v > 0);
    if (layer === "attention") {
      const s = scaleLog<string>().domain([0.03, 1, 30]).range(["#e0623a", "#efe9df", "#259978"]).clamp(true);
      return (v: number | null) => (v === null ? "#ece6dc" : s(Math.max(v, 0.03)));
    }
    if (values.length === 0) return () => "#ece6dc";
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const range = layer === "trials" ? ["#d9e8f5", "#1f4f80"] : ["#e3f1ea", "#0f5c46"];
    const s = scaleLog<string>().domain([lo, Math.max(hi, lo * 1.0001)]).range(range).clamp(true);
    return (v: number | null) => {
      if (v === null) return "#ece6dc";
      if (v <= 0) return layer === "trials" ? "#fbe6dc" : "#ece6dc";
      return s(v);
    };
  }, [cells, layer]);

  const ring = useMemo(() => {
    const max = Math.max(1, ...cells.map((c) => c.expected.median));
    return scaleSqrt().domain([0, max]).range([0, view === "world" ? 26 : 38]);
  }, [cells, view]);

  const hovered = hover ? byIso.get(hover.iso3) : undefined;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label={`Map: ${LAYER_META[layer].label}`}
      >
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#e4ddd2" strokeWidth="2" />
          </pattern>
        </defs>
        <g>
          {ALL_FEATURES.map((f) => {
            const iso = NUMERIC_TO_ISO3[String(f.id)];
            const cell = iso ? byIso.get(iso) : undefined;
            const d = path(f);
            if (!d) return null;
            if (!cell) {
              return <path key={String(f.id) + f.properties.name} d={d} fill="url(#hatch)" stroke="#e9e2d7" strokeWidth={0.5} />;
            }
            const isSel = iso === selected || iso === compare;
            return (
              <path
                key={iso}
                d={d}
                className="country-path cursor-pointer focus-ring"
                fill={color(layerValue(cell, layer))}
                stroke={isSel ? "#13201b" : "#fffdfa"}
                strokeWidth={isSel ? 1.8 : 0.8}
                tabIndex={0}
                role="button"
                aria-label={`${cell.country.name}: ${fmtCount(cell.expected.median)} expected affected births per year`}
                onClick={() => onSelect(iso)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(iso);
                  }
                }}
                onMouseMove={(e) => {
                  const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  const x = e.clientX - svg.left;
                  setHover({ iso3: iso, x, y: e.clientY - svg.top, flip: x > svg.width * 0.62 });
                }}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </g>
        {/* Hollow rings: the expected (unseen) patients, sized by expected births per year. */}
        <g pointerEvents="none">
          {ALL_FEATURES.map((f) => {
            const iso = NUMERIC_TO_ISO3[String(f.id)];
            const cell = iso ? byIso.get(iso) : undefined;
            if (!cell || (view === "focus" && iso === "USA")) return null;
            const c = projection(iso === "FRA" ? [2.4, 46.6] : iso === "USA" ? [-98, 39] : geoCentroid(f));
            if (!c) return null;
            const r = Math.max(3, ring(cell.expected.median));
            const isSel = iso === selected || iso === compare;
            return (
              <g key={`ring-${iso}`}>
                {isSel && <circle cx={c[0]} cy={c[1]} r={r} fill="none" stroke="#e0623a" strokeWidth={2} className="pulse-ring" />}
                <circle cx={c[0]} cy={c[1]} r={r} fill="rgba(255,253,250,0.18)" stroke={isSel ? "#e0623a" : "#13201b"} strokeOpacity={isSel ? 1 : 0.55} strokeWidth={isSel ? 2.2 : 1.3} />
                <circle cx={c[0]} cy={c[1]} r={2} fill={isSel ? "#e0623a" : "#13201b"} opacity={0.75} />
              </g>
            );
          })}
        </g>
      </svg>

      {hover && hovered && (
        <div
          className="pointer-events-none absolute z-20 card px-3 py-2 shadow-lg text-sm min-w-52"
          style={{ left: hover.flip ? hover.x - 14 : hover.x + 14, top: hover.y + 14, transform: hover.flip ? "translateX(-100%)" : undefined }}
        >
          <div className="font-semibold">{hovered.country.name}</div>
          <div className="text-ink-2 mt-1 space-y-0.5">
            <div>
              <span className="num font-semibold text-ink">{fmtCount(hovered.expected.median)}</span> expected births / yr
            </div>
            <div>{fmtOneIn(hovered.per100k.median)} births</div>
            <div>
              Research attention <span className="num font-semibold text-ink">{fmtRatio(hovered.attention)}</span>
            </div>
          </div>
          <div className="text-xs text-ink-3 mt-1">Click for evidence →</div>
        </div>
      )}
    </div>
  );
}

export function Legend({ layer }: { layer: Layer }) {
  const meta = LAYER_META[layer];
  const gradient =
    layer === "attention"
      ? "linear-gradient(90deg,#e0623a,#efe9df,#259978)"
      : layer === "trials"
        ? "linear-gradient(90deg,#fbe6dc 0 12%,#d9e8f5 12%,#1f4f80)"
        : "linear-gradient(90deg,#e3f1ea,#0f5c46)";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-2">
      <div className="flex items-center gap-2">
        <span>{meta.legendLow}</span>
        <span className="h-2.5 w-36 rounded-full" style={{ background: gradient }} />
        <span>{meta.legendHigh}</span>
      </div>
      <div className="flex items-center gap-2">
        <svg width="22" height="22" aria-hidden>
          <circle cx="11" cy="11" r="9" fill="none" stroke="#13201b" strokeOpacity={0.55} strokeWidth={1.3} />
          <circle cx="11" cy="11" r="2" fill="#13201b" opacity={0.75} />
        </svg>
        <span>ring = expected affected births / yr</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-5 rounded-sm" style={{ background: "repeating-linear-gradient(45deg,#e4ddd2 0 2px,transparent 2px 5px)" }} />
        <span>not modelled yet</span>
      </div>
    </div>
  );
}
