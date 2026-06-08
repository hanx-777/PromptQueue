import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-extension-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: readFileSync(resolve(__dirname, "manifest.json"), "utf-8")
        });
      }
    },
    {
      name: "bundle-extension-background",
      async generateBundle() {
        const id = resolve(__dirname, "src/background/index.ts");
        const result = await transformWithOxc(readFileSync(id, "utf-8"), id, {
          lang: "ts",
          target: "es2020",
          sourcemap: false
        });
        this.emitFile({
          type: "asset",
          fileName: "assets/background.js",
          source: result.code
        });
      }
    }
  ],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    copyPublicDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, "src/content/index.tsx"),
      output: {
        format: "iife",
        entryFileNames: "assets/content.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
