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
  build: {
    rollupOptions: {
      output: {
        /**
         * Group the always-loaded libraries into a few stable chunks.
         *
         * Rollup's default is a chunk per shared module, which after route
         * splitting produced 144 of them — every one a request, and every one
         * invalidating its neighbours' cache boundaries on an unrelated bump.
         * Grouping by library means a React or Radix upgrade re-downloads one
         * chunk instead of scattering across dozens.
         *
         * Deliberately partial: anything not named here returns undefined and
         * keeps Rollup's own splitting. A catch-all `return 'vendor'` would be
         * worse than the default, because a vendor chunk the entry imports is
         * eager — so a dependency used only by a lazy page (html2pdf, xlsx,
         * three) would be pulled back into the initial download, undoing the
         * split it exists to preserve.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;

          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
          if (id.includes('node_modules/@tanstack')) return 'vendor-query';
          if (
            /node_modules\/(@radix-ui|lucide-react|cmdk|vaul|sonner|class-variance-authority|clsx|tailwind-merge)/.test(
              id,
            )
          ) {
            return 'vendor-ui';
          }
          return undefined;
        },
      },
    },
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
