import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Initialize i18n before rendering
import "./i18n";

// Bundled fonts (offline-first: no network dependency)
import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/noto-sans-arabic/index.css";

// Leaflet styles
import "leaflet/dist/leaflet.css";

// Global styles (Tailwind + design tokens)
import "./App.css";

// User preferences (theme, text size, accessibility)
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { LiveRegionHost } from "./components/ui/LiveRegion";

// App component
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreferencesProvider>
      <LiveRegionHost />
      <App />
    </PreferencesProvider>
  </StrictMode>
);
