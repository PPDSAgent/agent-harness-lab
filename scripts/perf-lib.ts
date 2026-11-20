/**
 * Pure helpers for `npm run perf` (HL-009). Kept free of browser and Vite imports so
 * tests/it can exercise them in plain Node.
 *
 * Definitions follow web.dev: LCP https://web.dev/articles/lcp, CLS (session windows, max
 * window wins) https://web.dev/articles/cls, INP https://web.dev/articles/inp.
 */
import { gzipSync } from "node:zlib";

export type PerfEntry = {
  metric: string;
  value: number | null;
  unit: string;
  budget: number;
  machine: string;
  reason?: string;
};

export type LayoutShift = { value: number; startTime: number; hadRecentInput: boolean };

/**
 * CLS = the largest "session window" of layout shifts: a window ends after a 1 s gap or at
 * 5 s total length. Shifts right after user input are ignored (https://web.dev/articles/cls).
 */
export function computeCls(shifts: readonly LayoutShift[]): number {
  let best = 0;
  let sum = 0;
  let first = 0;
  let prev = 0;
  let open = false;
  for (const s of [...shifts].filter((x) => !x.hadRecentInput).sort((a, b) => a.startTime - b.startTime)) {
    if (open && s.startTime - prev < 1000 && s.startTime - first < 5000) {
      sum += s.value;
    } else {
      sum = s.value;
      first = s.startTime;
    }
    open = true;
    prev = s.startTime;
    best = Math.max(best, sum);
  }
  return Math.round(best * 10000) / 10000;
}

export type TraceEvent = { name?: string; ph?: string; ts?: number; args?: { frame?: string; data?: Record<string, unknown> } };

/**
 * LCP and layout shifts from a Chromium trace (Playwright `browser.startTracing`).
 * ASSUMPTION: event names and fields follow Lighthouse's trace processor
 * (https://github.com/GoogleChrome/lighthouse/blob/main/core/lib/tracehouse/trace-processor.js):
 * `navigationStart` (ts, microseconds) marks time zero; `largestContentfulPaint::Candidate`
 * events carry `args.frame`, the last one for the main frame is the LCP; `LayoutShift` events
 * carry `args.data.score`, `had_recent_input`, `is_main_frame`. Verified against the real trace
 * only by `npm run perf` output on the run machine, not by a spec document.
 */
export function metricsFromTrace(events: readonly TraceEvent[]): { lcp: number | null; shifts: LayoutShift[] } {
  const navs = events.filter((e) => e.name === "navigationStart" && typeof e.ts === "number" && e.args?.data?.isLoadingMainFrame === true);
  // OBSERVED (run 2139, 2026-11-13 Pacific; `node scripts/perf.ts` with the trace copied out): at a982104
  // (page has <link rel="icon">) the trace holds a third main-frame navigationStart (documentLoaderURL "",
  // frame 6BC5E8B7... instead of the page's 53DBD4AA...) after the LCP candidates; at a8a98ac (no icon link)
  // there are two navigationStart events, both in one frame. "Latest navigationStart" then picked a frame with
  // no candidates and LCP read null. ASSUMPTION: the favicon link is what triggers the extra frame; the cause
  // was not isolated. Only navigations whose frame painted a candidate can define the LCP; fall back to all
  // when none did.
  const painted = new Set(events.filter((e) => e.name === "largestContentfulPaint::Candidate").map((e) => e.args?.frame));
  const usable = navs.filter((n) => painted.has(n.args?.frame));
  const nav = (usable.length > 0 ? usable : navs).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))[0];
  if (!nav || nav.ts === undefined) return { lcp: null, shifts: [] };
  const frame = nav.args?.frame;
  const rel = (ts: number) => (ts - (nav.ts as number)) / 1000;
  const cands = events
    .filter((e) => e.name === "largestContentfulPaint::Candidate" && e.args?.frame === frame && typeof e.ts === "number")
    .sort((a, b) => (a.ts as number) - (b.ts as number));
  const last = cands[cands.length - 1];
  const shifts: LayoutShift[] = events
    .filter((e) => e.name === "LayoutShift" && typeof e.ts === "number" && e.args?.data?.is_main_frame === true && typeof e.args.data.score === "number")
    .map((e) => ({ value: e.args?.data?.score as number, startTime: rel(e.ts as number), hadRecentInput: e.args?.data?.had_recent_input === true }));
  return { lcp: last ? rel(last.ts as number) : null, shifts };
}

/** Gzip size of a buffer in bytes (level 9, as a static host would typically serve). */
export function gzipBytes(data: string | Uint8Array): number {
  return gzipSync(data, { level: 9 }).length;
}

/** Local `<script src>` and `<link rel="modulepreload" href>` targets: the initial JS of a page. */
export function initialScriptPaths(html: string): string[] {
  const found = new Set<string>();
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const isScript = /^<script/i.test(tag) && /\btype=["']module["']/i.test(tag);
    const isPreload = /^<link/i.test(tag) && /\brel=["']modulepreload["']/i.test(tag);
    if (!isScript && !isPreload) continue;
    const ref = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (ref && !/^[a-z]+:\/\//i.test(ref) && !ref.startsWith("//")) found.add(ref.replace(/^\.?\//, ""));
  }
  return [...found];
}

/** A null entry always carries a reason (runs/SCHEMA.md; rule 5: never estimate). */
export function entry(
  metric: string,
  value: number | null,
  unit: string,
  budget: number,
  machine: string,
  reason?: string,
): PerfEntry {
  if (value === null && !reason?.trim()) throw new Error(`${metric}: null value needs a reason`);
  return value === null ? { metric, value, unit, budget, machine, reason } : { metric, value, unit, budget, machine };
}
