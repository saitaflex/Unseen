export function fmtCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 100) return Math.round(n).toLocaleString("en-US");
  if (n >= 10) return n.toFixed(0);
  if (n >= 1) return n.toFixed(1);
  if (n >= 0.1) return n.toFixed(2);
  return n > 0 ? "<0.1" : "0";
}

export function fmtOneIn(per100k: number): string {
  if (!(per100k > 0)) return "—";
  const n = 1e5 / per100k;
  const rounded = n >= 10000 ? Math.round(n / 1000) * 1000 : n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n);
  return `1 in ${rounded.toLocaleString("en-US")}`;
}

export function fmtPct(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtRatio(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return "—";
  if (x === 0) return "0×";
  if (x < 0.1) return `${x.toFixed(2)}×`;
  if (x < 10) return `${x.toFixed(1)}×`;
  return `${Math.round(x)}×`;
}

export function fmtBig(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return Math.round(n).toString();
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
