import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./": caminhos relativos — funciona no GitHub Pages (subpasta), no Capacitor e em qualquer servidor
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2020", outDir: "dist", assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
