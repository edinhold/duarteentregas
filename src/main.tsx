import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "leaflet/dist/leaflet.css";
import "./index.css";

// Cleanup: unregister any legacy push service workers left on devices.
// Only the PWA (Workbox) service worker should remain registered.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((reg) => {
        const url = reg.active?.scriptURL ?? "";
        if (/onesignal|push-sw|push-worker/i.test(url)) {
          reg.unregister().catch(() => {});
        }
      });
    })
    .catch(() => {});
}



createRoot(document.getElementById("root")!).render(<App />);
