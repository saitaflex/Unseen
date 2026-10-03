/** Tiny router: "/" is the landing page; "/atlas" (or any atlas deep link) is the app. */
const ATLAS_PARAMS = ["d", "c", "l", "story"];

export function isAtlasRoute(pathname: string, search: string, hash: string): boolean {
  if (pathname.startsWith("/atlas")) return true;
  if (hash === "#method") return true;
  const p = new URLSearchParams(search);
  return ATLAS_PARAMS.some((k) => p.has(k));
}

export function navigate(to: string): void {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0 });
}
