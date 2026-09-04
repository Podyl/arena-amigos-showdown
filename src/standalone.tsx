import React from "react";
import { createRoot } from "react-dom/client";
import { PhaserBrawlerPro } from "./components/game/PhaserBrawlerPro";
import "./styles.css";
import "./phaser-brawler.css";

createRoot(document.getElementById("root")!).render(
  <PhaserBrawlerPro />,
);
