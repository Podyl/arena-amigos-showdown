import { createFileRoute } from "@tanstack/react-router";
import { Game3D } from "@/components/game3d/Game3D";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Arena Brawl 3D – arenaspel i webbläsaren" },
      {
        name: "description",
        content:
          "Arena Brawl 3D är ett mobilanpassat arenaspel i 3D: lutad kamera, två spakar, superattack och vågor av fiender.",
      },
      { property: "og:title", content: "Arena Brawl 3D – arenaspel i webbläsaren" },
      {
        property: "og:description",
        content: "Tecknad 3D-arena med två spakar, super och vågor av fiender. Spela direkt i mobilen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <Game3D />;
}
