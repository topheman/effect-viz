import "./lib/polyfill"; // Must be first - browser compatibility fixes
import "./lib/legacyStorage"; // Before the app: hooks read storage on import

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
