import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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

if (!isInIframe || isPreviewHost) {
  cleanupOldInstallCache();
}

createRoot(document.getElementById("root")!).render(<App />);
