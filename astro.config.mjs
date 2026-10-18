import { defineConfig } from "astro/config";

export default defineConfig({
  build: {
    /* Inlined per-page <style> tags get swapped on ClientRouter navigation,
       which re-registers @font-face and flashes the fallback font. */
    inlineStylesheets: "never",
  },
});
