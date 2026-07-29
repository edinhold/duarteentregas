import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "leaflet/dist/leaflet.css";
import "./index.css";

// Cleanup: unregister legacy push service workers from the previous
// implementation. The current OneSignal worker lives under /onesignal/ and
// must be preserved.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((reg) => {
        const url = reg.active?.scriptURL ?? "";
        if (url.includes("/onesignal/")) return; // current push worker
        if (/push-sw|push-worker|OneSignalSDKWorker/i.test(url)) {
          reg.unregister().catch(() => {});
        }
      });
    })
    .catch(() => {});
}


createRoot(document.getElementById("root")!).render(<App />);
