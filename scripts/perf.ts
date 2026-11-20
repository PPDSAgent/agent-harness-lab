/**
 * HL-009 performance harness: `npm run perf`. Prints ONLY a JSON array of perf[] entries
 * (runs/SCHEMA.md) on stdout; progress goes to stderr.
 *
 * Builds the production bundle into a temp dir, serves it with Vite preview, loads the main
 * route in the system Chrome (Playwright, channel "chrome") while recording a Chromium trace
 * (https://playwright.dev/docs/api/class-browser#browser-start-tracing). LCP and CLS are derived
 * from the trace events (scripts/perf-lib.ts metricsFromTrace; event names are an ASSUMPTION
 * there). A PerformanceObserver runs alongside as a cross-check and is logged to stderr, and
 * is the source for INP only (no trace-event equivalent is used). Metric definitions:
 * scripts/perf-lib.ts. These are lab numbers from one cold load on the run machine, not field data. Budgets: TESTING.md "Performance budgets".
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview, type PreviewServer } from "vite";
import { chromium } from "playwright-core";
import { computeCls, entry, metricsFromTrace, gzipBytes, initialScriptPaths, type LayoutShift, type PerfEntry, type TraceEvent } from "./perf-lib.ts";

const repo = resolve(fileURLToPath(import.meta.url), "../..");
const MACHINE = process.env.PERF_MACHINE || "cloud-runner";
const log = (m: string) => process.stderr.write(`perf: ${m}\n`);

type Observed = { lcp: number | null; shifts: LayoutShift[]; inp: number | null };

type Measured = { observed: Observed; traced: { lcp: number | null; shifts: LayoutShift[] } };

async function measureBrowser(url: string, tracePath: string): Promise<Measured> {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.addInitScript(`
      window.__perf = { lcp: null, shifts: [], inp: null };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; })
        .observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries())
        window.__perf.shifts.push({ value: e.value, startTime: e.startTime, hadRecentInput: e.hadRecentInput }); })
        .observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries())
        if (e.interactionId > 0) window.__perf.inp = Math.max(window.__perf.inp ?? 0, e.duration); })
        .observe({ type: "event", buffered: true, durationThreshold: 16 });
    `);
    await browser.startTracing(page, {
      path: tracePath,
      categories: ["loading", "devtools.timeline", "disabled-by-default-devtools.timeline", "blink.user_timing", "latencyInfo"],
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate("document.fonts.ready.then(() => true)");
    await page.waitForTimeout(500);
    // One real interaction on the main route (toggle the data table) so INP has an event to observe.
    await page.getByRole("button", { name: /table|chart/i }).first().click();
    await page.waitForTimeout(500);
    const observed = (await page.evaluate("window.__perf")) as Observed;
    await browser.stopTracing();
    if (!existsSync(tracePath)) throw new Error("Chromium trace file was not written.");
    const parsed = JSON.parse(readFileSync(tracePath, "utf8")) as { traceEvents?: TraceEvent[] } | TraceEvent[];
    const traced = metricsFromTrace(Array.isArray(parsed) ? parsed : (parsed.traceEvents ?? []));
    return { observed, traced };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const dist = mkdtempSync(join(tmpdir(), "hl-perf-dist-"));
  let server: PreviewServer | undefined;
  try {
    log("building production bundle");
    await build({ root: repo, logLevel: "silent", build: { outDir: dist, emptyOutDir: true } });

    const html = readFileSync(join(dist, "index.html"), "utf8");
    const files = initialScriptPaths(html);
    const jsBytes = files.reduce((n, f) => n + gzipBytes(readFileSync(join(dist, f))), 0);
    log(`initial JS: ${files.join(", ")} = ${jsBytes} bytes gzip`);

    server = await preview({ root: repo, logLevel: "silent", build: { outDir: dist }, preview: { host: "127.0.0.1", port: 0 } });
    const base = server.resolvedUrls?.local[0];
    if (!base) throw new Error("Preview server did not report a URL.");
    log(`measuring ${base}`);
    const tracePath = join(dist, "..", `${basename(dist)}.trace.json`);
    const { observed, traced } = await measureBrowser(base, tracePath);
    rmSync(tracePath, { force: true });
    log(`cross-check PerformanceObserver: lcp=${observed.lcp} cls=${computeCls(observed.shifts)}; trace: lcp=${traced.lcp} cls=${computeCls(traced.shifts)}`);
    const o = { lcp: traced.lcp, shifts: traced.shifts, inp: observed.inp };

    const out: PerfEntry[] = [
      entry("lcp_main_route", o.lcp === null ? null : Math.round(o.lcp), "ms", 2500, MACHINE,
        o.lcp === null ? "no largestContentfulPaint::Candidate event was found in the Chromium trace" : undefined),
      entry("cls_main_route", computeCls(o.shifts), "score", 0.1, MACHINE),
      entry("inp_main_route", o.inp === null ? null : Math.round(o.inp), "ms", 200, MACHINE,
        o.inp === null ? "Chrome reported no interaction-bound event entry (one click on the table toggle); the page has one interaction, so no worst-case sample" : undefined),
      entry("initial_js_gzip_main_route", Math.round((jsBytes / 1024) * 10) / 10, "KB", 250, MACHINE),
      entry("ingest_10k_events", null, "ms", 2000, MACHINE,
        "no 10,000-event fixture exists yet and the ingest benchmark is not built; nothing was measured"),
      entry("regression_tolerance", null, "percent", 20, MACHINE,
        "no merged-run baseline for these metrics: the perf[] entries in runs/ have no recorded merge state and use different metrics, and run state lives on GitHub, not in files"),
    ];
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } finally {
    await server?.close();
    rmSync(dist, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
