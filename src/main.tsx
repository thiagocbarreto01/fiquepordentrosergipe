import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Service worker registration (PWA installability).
// Guarded so it never runs inside the Lovable editor preview iframe or preview hosts.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.endsWith("lovable.dev");

  if (isInIframe || isPreviewHost) {
    // Clean up any stale SW in preview contexts.
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* installability is non-critical */
      });
    });
  }
}
