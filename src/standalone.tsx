import React from "react";
import { createRoot } from "react-dom/client";
import { ArenaBrawlUltimate } from "./components/game/ArenaBrawlUltimate";
import "./styles.css";
import "./arena-brawl-ultimate.css";

createRoot(document.getElementById("root")!).render(
  <ArenaBrawlUltimate />,
);
