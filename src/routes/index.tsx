import { createFileRoute } from "@tanstack/react-router";
import { BrawlGame } from "@/components/game/BrawlGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arena Brawl – snabbt arenaspel i webbläsaren" },
      {
        name: "description",
        content:
          "Arena Brawl är ett mobilanpassat top-down arenaspel: styr med två spakar, överlev vågor av fiender och ladda din super.",
      },
      { property: "og:title", content: "Arena Brawl – snabbt arenaspel i webbläsaren" },
      {
        property: "og:description",
        content: "Överlev vågor av fiender i en färgstark arena. Två spakar, en super, högsta poäng.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <BrawlGame />;
}
