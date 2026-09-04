import React from "react";
import { createRoot } from "react-dom/client";
import { BrawlStarsLike } from "./components/game/BrawlStarsLike";
import "./styles.css";
import "./brawl-stars-like.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrawlStarsLike />
  </React.StrictMode>,
);