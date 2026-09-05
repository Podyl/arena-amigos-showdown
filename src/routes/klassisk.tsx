import { createFileRoute } from "@tanstack/react-router";
import { BrawlGame } from "@/components/game/BrawlGame";

export const Route = createFileRoute("/klassisk")({
  head: () => ({
    meta: [
      { title: "Arena Brawl Klassisk – 2D-läget" },
      {
        name: "description",
        content:
          "Det klassiska 2D-läget av Arena Brawl med progression, skins och vågor av fiender.",
      },
      { property: "og:title", content: "Arena Brawl Klassisk – 2D-läget" },
      {
        property: "og:description",
        content: "Spela det klassiska 2D-läget med progression, skins och bossar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <BrawlGame />,
});
