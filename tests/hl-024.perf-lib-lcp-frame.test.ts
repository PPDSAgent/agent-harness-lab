/**
 * HL-024 reviewer item 3 (reviews/2026-11-13T2139-HL-024-r1.md): LCP frame selection in
 * `metricsFromTrace`. All trace events below are SYNTHETIC trace data, hand-written to match
 * the event shapes read by scripts/perf-lib.ts (ts in microseconds, args.frame, args.data).
 * Guards behaviour already on HEAD, so it is green there; it is not a fix freeze.
 */
import { describe, expect, it } from "vitest";
import { metricsFromTrace, type TraceEvent } from "../scripts/perf-lib";

const nav = (ts: number, frame: string): TraceEvent => ({
  name: "navigationStart",
  ph: "R",
  ts,
  args: { frame, data: { isLoadingMainFrame: true } },
});
const cand = (ts: number, frame: string): TraceEvent => ({
  name: "largestContentfulPaint::Candidate",
  ph: "R",
  ts,
  args: { frame },
});

describe("metricsFromTrace LCP frame selection (SYNTHETIC trace)", () => {
  it("measures LCP from the painted frame's navigation, not the later candidate-less one", () => {
    const events: TraceEvent[] = [
      nav(1_000_000, "frame-page"),
      cand(1_300_000, "frame-page"),
      cand(1_850_000, "frame-page"),
      nav(2_000_000, "frame-empty"),
    ];
    // last candidate 1_850_000 minus its own nav 1_000_000, microseconds to ms
    expect(metricsFromTrace(events).lcp).toBe(850);
  });

  it("returns lcp null without throwing when no candidates exist", () => {
    const events: TraceEvent[] = [nav(1_000_000, "frame-page"), nav(2_000_000, "frame-empty")];
    expect(() => metricsFromTrace(events)).not.toThrow();
    expect(metricsFromTrace(events).lcp).toBeNull();
  });
});
