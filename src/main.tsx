import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { hasActiveRefreshLock, hasAttendanceDraft } from "./lib/refreshLock";

declare const __APP_VERSION__: string;

const APP_VERSION_KEY = "mayukh-app-version";
const APP_REFRESH_KEY = "mayukh-app-auto-refresh";

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

// In preview/iframe contexts, unregister any service workers so the editor
// preview is never served stale content. The push service worker (push-sw.js)
// is preserved on production hosts.
const cleanupPreviewServiceWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  } catch (error) {
    console.warn("Preview SW cleanup skipped", error);
  }
};

const checkForPublishedUpdate = async () => {
  if (isInIframe || isPreviewHost) return;
  if (hasActiveRefreshLock() || hasAttendanceDraft()) return;
  // Don't auto-refresh while a download/preview is in progress
  if ((window as any).__mayukhDownloading) return;
  // Only auto-refresh once per session
  if (sessionStorage.getItem("mayukh-app-refreshed") === "1") return;
  try {
    const response = await fetch(`/app-version.json?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) return;
    const { version } = (await response.json()) as { version?: string };
    if (!version) return;
    const storedVersion = localStorage.getItem(APP_VERSION_KEY);
    localStorage.setItem(APP_VERSION_KEY, version);

    if (storedVersion && storedVersion !== version && sessionStorage.getItem(APP_REFRESH_KEY) !== version) {
      sessionStorage.setItem(APP_REFRESH_KEY, version);
      sessionStorage.setItem("mayukh-app-refreshed", "1");
      const url = new URL(window.location.href);
      url.searchParams.set("app-refresh", Date.now().toString());
      window.location.replace(url.toString());
    }
  } catch (error) {
    console.warn("App update check skipped", error);
  }
};

if (isPreviewHost || isInIframe) {
  cleanupPreviewServiceWorkers();
}

checkForPublishedUpdate();
window.addEventListener("focus", checkForPublishedUpdate);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForPublishedUpdate();
});
window.setInterval(checkForPublishedUpdate, 5 * 60 * 1000);

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>,
);
