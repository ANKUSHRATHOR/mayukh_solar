import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const buildVersion = `${Date.now()}`;
const buildVersionPlugin: Plugin = {
  name: "mayukh-build-version",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "app-version.json",
      source: JSON.stringify({ version: buildVersion }),
    });
  },
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
  server: {
    host: "::",
    // Honour PORT when the harness assigns one; 8080 stays the default.
    port: Number(process.env.PORT) || 8080,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
    hmr: {
      overlay: false,
    },
    proxy: {
      // Keep this ahead of the '/api' rule below — Vite matches prefixes in order.
      '/api/discom': {
        target: 'https://cescrajasthan.co.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/discom/, ''),
      },
      // Everything else under /api is the Node backend in ./server.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    }
  },
  plugins: [
    react(),
    buildVersionPlugin,
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
