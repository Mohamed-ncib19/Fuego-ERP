import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * In dev the renderer runs on :5173 and proxies /api to the backend — so the
 * page always talks same-origin and session cookies just work (the
 * reference's portal-proxies-/api shape). In production the built bundle is
 * served by the backend itself.
 */
const apiTarget = `http://127.0.0.1:${process.env.FUEGO_API_PORT || 3220}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
