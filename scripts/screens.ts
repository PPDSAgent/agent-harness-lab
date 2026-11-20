/**
 * HL-007 screenshot harness: `npm run screens -- <task>` (or SCREENS_TASK=<task>).
 *
 * Builds the app into a throwaway directory, serves it with Vite's production preview server,
 * and captures every route in ROUTES at each width and theme into <SCREENS_DIR>/<task>/
 * (SCREENS_DIR defaults to `screens`, relative to the repo root).
 *
 * Browser: Playwright driving the system Chrome (`channel: "chrome"`). `playwright-core` is
 * used because it never downloads browsers (the download is blocked in cloud runs).
 * Docs: https://playwright.dev/docs/browsers#google-chrome--microsoft-edge
 *
 * To cover a new page, add one line to ROUTES.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview, type PreviewServer } from "vite";
import { chromium } from "playwright-core";

/** One entry per page to capture. `name` becomes the file-name prefix. */
export const ROUTES: readonly { name: string; path: string }[] = [{ name: "home", path: "/" }];

const WIDTHS = [1440, 390] as const;
const THEMES = ["light", "dark"] as const;
/** Same key as src/lib/theme.ts THEME_STORAGE_KEY; the page reads it before first paint. */
const THEME_KEY = "hl-theme";

const repo = resolve(fileURLToPath(import.meta.url), "../..");

async function main(): Promise<void> {
  const task = process.env.SCREENS_TASK || process.argv[2];
  if (!task) {
    throw new Error("No task name: run `npm run screens -- <task>` or set SCREENS_TASK.");
  }
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(task)) throw new Error(`Invalid task name: ${task}`);
  const outDir = resolve(repo, process.env.SCREENS_DIR || "screens", task);
  mkdirSync(outDir, { recursive: true });

  const dist = mkdtempSync(join(tmpdir(), "hl-screens-dist-"));
  let server: PreviewServer | undefined;
  try {
    await build({ root: repo, logLevel: "warn", build: { outDir: dist, emptyOutDir: true } });
    server = await preview({
      root: repo,
      logLevel: "warn",
      build: { outDir: dist },
      preview: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    const base = server.resolvedUrls?.local[0];
    if (!base) throw new Error("Preview server did not report a URL.");

    const browser = await chromium.launch({ channel: "chrome" });
    try {
      for (const width of WIDTHS) {
        for (const theme of THEMES) {
          const context = await browser.newContext({
            viewport: { width, height: 900 },
            deviceScaleFactor: 1,
            reducedMotion: "reduce",
          });
          try {
            await context.addInitScript(
              ([key, value]) => localStorage.setItem(key, value),
              [THEME_KEY, theme] as const,
            );
            const page = await context.newPage();
            for (const route of ROUTES) {
              await page.goto(new URL(route.path, base).href, { waitUntil: "networkidle" });
              await page.evaluate("document.fonts.ready.then(() => true)");
              const file = join(outDir, `${route.name}-${width}-${theme}.png`);
              await page.screenshot({ path: file, fullPage: true });
              console.log(`wrote ${file}`);
            }
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    await server?.close();
    rmSync(dist, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
