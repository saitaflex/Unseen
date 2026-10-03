import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Landing } from "./components/Landing";
import { isAtlasRoute } from "./lib/route";

function Root() {
  const atlasNow = () => isAtlasRoute(window.location.pathname, window.location.search, window.location.hash);
  const [atlas, setAtlas] = useState(atlasNow);
  useEffect(() => {
    const onNav = () => setAtlas(atlasNow());
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);
  return atlas ? <App /> : <Landing />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
