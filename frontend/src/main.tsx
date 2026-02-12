import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Initialize i18n before rendering
import "./i18n";

// Leaflet styles
import "leaflet/dist/leaflet.css";

// Global styles (Tailwind + custom)
import "./App.css";

// App component
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
