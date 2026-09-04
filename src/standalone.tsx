import React from "react";
import { createRoot } from "react-dom/client";
import { ArenaBrawlUltimate } from "./components/game/ArenaBrawlUltimate";
import "./styles.css";
import "./arena-brawl-ultimate.css";

// Final standalone entry for the new 3v3 Core Clash build.
createRoot(document.getElementById("root")!).render(
  <ArenaBrawlUltimate />,
);
