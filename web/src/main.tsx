import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { isAtlasRoute } from "./lib/route";

// Code-split: the landing page and the atlas (map, tools, agent UI) load as separate chunks.
const App = lazy(() => import("./App"));
const Landing = lazy(() => import("./components/Landing").then((m) => ({ default: m.Landing })));

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <img src="/brand/unseen-mark.png" alt="" className="h-14 w-14 animate-pulse" />
    </div>
  );
}

function Root() {
  const atlasNow = () => isAtlasRoute(window.location.pathname, window.location.search, window.location.hash);
  const [atlas, setAtlas] = useState(atlasNow);
  useEffect(() => {
    const onNav = () => setAtlas(atlasNow());
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);
  return <Suspense fallback={<Splash />}>{atlas ? <App /> : <Landing />}</Suspense>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
