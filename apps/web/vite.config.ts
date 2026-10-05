import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3001";

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
    // Behind a reverse proxy (e.g. Nginx Proxy Manager) Vite rejects unknown host names:
    // list them in DEV_ALLOWED_HOSTS, e.g. "familywall.example.com".
    allowedHosts: (process.env.DEV_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    proxy: {
      // Override with API_PROXY_TARGET when the API runs on another port.
      // xfwd keeps the original https host for the iOS CalDAV profile.
      "/api": { target: apiTarget, xfwd: true },
      // CalDAV for iOS Reminders lives outside /api.
      "/dav": { target: apiTarget, xfwd: true },
      "/.well-known/caldav": { target: apiTarget, xfwd: true }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
