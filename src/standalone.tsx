import React from "react";
import { createRoot } from "react-dom/client";
import { BrawlGame } from "./components/game/BrawlGame";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrawlGame />
  </React.StrictMode>,
);
