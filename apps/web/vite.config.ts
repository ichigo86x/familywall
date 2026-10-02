import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths: the same build works at "/" behind nginx and under the
  // Home Assistant ingress prefix (/api/hassio_ingress/<token>/).
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Consume the shared package from source so Vite does not have to handle its CommonJS build.
      "@familywall/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001"
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
