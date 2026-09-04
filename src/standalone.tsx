import React from "react";
import { createRoot } from "react-dom/client";
import { PhaserBrawler } from "./components/game/PhaserBrawler";
import "./styles.css";
import "./phaser-brawler.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PhaserBrawler />
  </React.StrictMode>,
);
