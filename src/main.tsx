import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { initNative } from "./native";
import "./index.css";

// Unregister stale service workers (sw.js / service-worker.js) and clear caches
// on EVERY host — preview and production — so users always get the latest build
// and recent fixes (sticky form drafts, sales document uploads, security
// patches) are not masked by a cached app shell. The push notification worker
// (push-sw.js) is preserved.
const cleanupStaleServiceWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((r) => {
        const scriptURL = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
        if (scriptURL.includes("push-sw.js")) return Promise.resolve(true);
        return r.unregister();
      }),
    );
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !name.includes("push"))
          .map((name) => caches.delete(name)),
      );
    }
  } catch (error) {
    console.warn("SW cleanup skipped", error);
  }
};

cleanupStaleServiceWorkers();

// Capacitor shell wiring (splash, status bar, back button, offline state).
// No-op in the browser and in the PWA — see src/native/index.ts.
initNative();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>,
);
