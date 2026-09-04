import React from "react";
import { createRoot } from "react-dom/client";
import { PhaserBrawlerFixed } from "./components/game/PhaserBrawlerFixed";
import "./styles.css";
import "./phaser-brawler.css";

createRoot(document.getElementById("root")!).render(
  <PhaserBrawlerFixed />,
);
