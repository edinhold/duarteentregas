import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "leaflet/dist/leaflet.css";
import "./index.css";

// Cleanup: unregister legacy push service workers (OneSignal / custom web-push).
// The push layer was removed; only the PWA service worker should remain.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((reg) => {
        const url = reg.active?.scriptURL ?? "";
        if (/OneSignalSDK|onesignal|push-sw|push-worker/i.test(url)) {
          reg.unregister().catch(() => {});
        }
      });
    })
    .catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);
