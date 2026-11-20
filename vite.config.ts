import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Default include (all *.test.*) is deliberately kept so frozen tests are never excluded;
  // only Playwright specs (e2e/**/*.spec.ts, run by `npm run test:ui`; tests/journeys/**, run by `npm run test:journeys`) are excluded.
  test: { css: false, exclude: [...configDefaults.exclude, "e2e/**/*.spec.ts", "tests/journeys/**"] },
});
