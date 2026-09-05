import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import RootErrorBoundary from "@/components/RootErrorBoundary";
import "leaflet/dist/leaflet.css";
import "./index.css";

console.log("[App:boot]", "Inicializando React DOM");

// Handlers globais de erro para diagnóstico no boot
window.addEventListener("error", (event) => {
  console.error("[App:boot:error]", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[App:boot:unhandledrejection]", event.reason);
});

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}

