import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { initOneSignal } from "./lib/onesignal";

// Initialize OneSignal push notifications on native platforms (Android/iOS).
// No-op on web.
initOneSignal();

createRoot(document.getElementById("root")!).render(<App />);
