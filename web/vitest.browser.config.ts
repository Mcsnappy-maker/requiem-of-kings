import path from "node:path";
import { realpathSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// A canonical root keeps module mocks and source imports aligned on Windows junctions.
const root = realpathSync(import.meta.dirname);
export default defineConfig({
  root,
  plugins: [react()],
  optimizeDeps: { include: ["vitest-browser-react", "expect-type"] },
  test: {
    globals: true,
    include: ["src/**/*.browser.{test,spec}.{ts,tsx}"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
  resolve: { alias: { "@": path.join(root, "src") } },
});
