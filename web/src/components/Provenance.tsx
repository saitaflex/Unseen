import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

export type Kind = "observed" | "literature" | "inferred" | "curated" | "computed";

const KIND_STYLE: Record<Kind, { bg: string; fg: string; label: string; title: string }> = {
  observed: { bg: "#dff1e9", fg: "#0f5c46", label: "observed", title: "Measured directly in a public dataset" },
  literature: { bg: "#e1ecf7", fg: "#1f4f80", label: "literature", title: "Taken from a cited peer-reviewed source or survey" },
  inferred: { bg: "#f8ecd2", fg: "#8a5a07", label: "inferred", title: "A stated modelling assumption — see Method" },
  curated: { bg: "#ece4f6", fg: "#5b3a8c", label: "curated", title: "Expert-curated override, documented in Method" },
  computed: { bg: "#ece8e1", fg: "#13201b", label: "computed", title: "Calculated deterministically by UNSEEN's open formulas" },
};

export function KindBadge({ kind }: { kind: Kind }) {
  const s = KIND_STYLE[kind];
  return (
    <span className="chip" style={{ background: s.bg, color: s.fg }} title={s.title}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.fg }} />
      {s.label}
    </span>
  );
}

export function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-brand-deep underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
    >
      {children}
      <ExternalLink size={12} aria-hidden />
    </a>
  );
}

export function EvidenceCard({
  title,
  kind,
  children,
  source,
}: {
  title: string;
  kind: Kind;
  children: ReactNode;
  source?: { label: string; url: string };
}) {
  return (
    <div className="rounded-2xl border border-line bg-paper/60 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[0.78rem] font-semibold uppercase tracking-wide text-ink-3">{title}</div>
        <KindBadge kind={kind} />
      </div>
      <div className="mt-1.5 text-sm text-ink leading-relaxed">{children}</div>
      {source && (
        <div className="mt-2 text-xs text-ink-3">
          Source: <SourceLink href={source.url}>{source.label}</SourceLink>
        </div>
      )}
    </div>
  );
}
