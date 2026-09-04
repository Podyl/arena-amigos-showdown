import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "standalone-dist",
    emptyOutDir: true,
    assetsInlineLimit: 30_000_000,
    rollupOptions: {
      input: "standalone-index.html",
    },
  },
});
