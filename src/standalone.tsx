import React from "react";
import { createRoot } from "react-dom/client";
import { PhaserBrawlerFixed } from "./components/game/PhaserBrawlerFixed";
import "./styles.css";
import "./phaser-brawler.css";

// Runtime-tested Phaser build entry.
createRoot(document.getElementById("root")!).render(
  <PhaserBrawlerFixed />,
);
