import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // ── Heavy export libs — only loaded when user clicks Export ──
          "vendor-xlsx": ["xlsx"],
          "vendor-pdf": ["jspdf", "html2canvas"],
          "vendor-pptx": ["pptxgenjs"],
          // ── Chart library — loaded on first dashboard visit ──
          "vendor-recharts": ["recharts"],
          // ── React core — cached long-term ──
          "vendor-react": ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
}));
