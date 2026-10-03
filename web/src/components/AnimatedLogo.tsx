/**
 * The UNSEEN mark, rebuilt as vectors from the logo's own geometry (measured from logo.png,
 * same coordinate space) so it can be animated piece by piece:
 *   1. the open circle — the unseen patient — appears big in the centre,
 *   2. it settles into place and the dots drip down out of it, getting smaller,
 *   3. the U draws itself, and the "nseen" lettering wipes in.
 */
const RING = { cx: 254.5, cy: 402, r: 18.5, w: 8 };
const DOTS = [
  { cx: 254.5, cy: 454, r: 20.5 },
  { cx: 254.5, cy: 498.5, r: 17.5 },
  { cx: 254.5, cy: 536, r: 14 },
  { cx: 253.7, cy: 567, r: 10 },
  { cx: 247, cy: 589.5, r: 6.75 },
];
// U centre-line drawn from the tail (next to the last dot) round the bowl and up the left bar,
// so the falling dots flow straight into the U. 45-unit stroke; the tail gets a diagonal cut.
const U_PATH = "M232 592.5 H193 A49.5 49.5 0 0 1 143.5 543 V446.5";
const VIEW = { x: 110, y: 370, w: 805, h: 255 };
const CENTER = { x: VIEW.x + VIEW.w / 2, y: VIEW.y + VIEW.h / 2 };

export function AnimatedLogo({ animate = true, className = "" }: { animate?: boolean; className?: string }) {
  const ringShift = { x: CENTER.x - RING.cx, y: CENTER.y - RING.cy };
  return (
    <svg
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      className={`unseen-logo ${animate ? "is-animated" : ""} ${className}`}
      role="img"
      aria-label="UNSEEN"
      style={{ overflow: "visible" }}
    >
      <defs>
        <clipPath id="u-cut">
          {/* everything left of the slanted cut at the tail of the U */}
          <polygon points="100,360 300,360 300,560 222,560 241,620 100,620" />
        </clipPath>
      </defs>

      <g clipPath="url(#u-cut)">
        <path
          className="logo-u"
          d={U_PATH}
          pathLength={1}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={45}
          strokeLinecap="round"
        />
      </g>

      {DOTS.map((d, i) => (
        <circle
          key={i}
          className="logo-dot"
          cx={d.cx}
          cy={d.cy}
          r={d.r}
          fill="var(--color-brand)"
          style={{ ["--fall" as string]: `${RING.cy - d.cy}px`, animationDelay: `${1.5 + i * 0.12}s` }}
        />
      ))}

      {/* the big dot: starts in the centre and opens into the ring as it lands */}
      <circle
        className="logo-seed"
        cx={RING.cx}
        cy={RING.cy}
        r={RING.r + RING.w / 2}
        fill="var(--color-brand)"
        style={{ ["--rx" as string]: `${ringShift.x}px`, ["--ry" as string]: `${ringShift.y}px` }}
      />
      <circle
        className="logo-ring"
        cx={RING.cx}
        cy={RING.cy}
        r={RING.r}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={RING.w}
        style={{ ["--rx" as string]: `${ringShift.x}px`, ["--ry" as string]: `${ringShift.y}px` }}
      />
      <circle className="logo-ripple" cx={RING.cx} cy={RING.cy} r={RING.r} fill="none" stroke="var(--color-brand)" strokeWidth={2} />

      <image className="logo-text" href="/brand/nseen.png" x={296} y={370} width={619} height={255} />
    </svg>
  );
}
