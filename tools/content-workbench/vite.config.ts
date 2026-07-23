import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const tauriDevHost = process.env.TAURI_DEV_HOST;

export default defineConfig(({ command }) => ({
  plugins: [react()],
  cacheDir: "../../node_modules/.vite-content-workbench",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: tauriDevHost || false,
    hmr: tauriDevHost
      ? {
          protocol: "ws",
          host: tauriDevHost,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  html: command === "serve" ? { cspNonce: "content-workbench-dev" } : undefined,
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    css: true,
    clearMocks: true,
    restoreMocks: true,
    globals: false,
  },
}));
