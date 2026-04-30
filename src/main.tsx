import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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

const cleanupOldInstallCache = async () => {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        try {
          await registration.update();
        } catch {
          // Continue cleanup even if the old worker cannot be updated.
        }
        return registration.unregister();
      })
    );

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }

    if (navigator.serviceWorker.controller && !sessionStorage.getItem("mayukh-cache-cleaned")) {
      sessionStorage.setItem("mayukh-cache-cleaned", "true");
      const url = new URL(window.location.href);
      url.searchParams.set("app-refresh", Date.now().toString());
      window.location.replace(url.toString());
    }
  } catch (error) {
    console.warn("App cache cleanup skipped", error);
  }
};

const refreshToLatestApp = async () => {
  if (sessionStorage.getItem(APP_REFRESH_KEY) === __APP_VERSION__) return;
  sessionStorage.setItem(APP_REFRESH_KEY, __APP_VERSION__);

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set("app-refresh", Date.now().toString());
    window.location.replace(url.toString());
  }
};

const checkForPublishedUpdate = async () => {
  if (isInIframe || isPreviewHost) return;

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

    if (storedVersion && storedVersion !== version) {
      await refreshToLatestApp();
    }
  } catch (error) {
    console.warn("App update check skipped", error);
  }
};

if (!isInIframe || isPreviewHost) {
  cleanupOldInstallCache();
}

checkForPublishedUpdate();
window.addEventListener("focus", checkForPublishedUpdate);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForPublishedUpdate();
});
window.setInterval(checkForPublishedUpdate, 5 * 60 * 1000);

createRoot(document.getElementById("root")!).render(<App />);
