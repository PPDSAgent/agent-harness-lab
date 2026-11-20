// @vitest-environment node
// FROZEN acceptance tests for HL-015b B1 (pure stepper). Builder may not edit this file. All data is SYNTHETIC.
//
// CONTRACT: src/lib/scrubber.ts exports
//   type ScrubStep = { position: number; stepIndex: number; name: string | null; durationMs: number | null; isError: boolean }
//   buildScrubSteps(swimlane: Swimlane): ScrubStep[]
//     one entry per PLACED bar (startMs !== null) of `swimlane.bars`, in the same order as the bars, `position` = 0-based
//     index in the returned list; stepIndex/name/durationMs/isError copied from the bar (null stays null). Does not mutate input.
//     Extra fields on a step are allowed; these five must be present with these names.
//   clampStep(pos: number, n: number): number | null
//     n === 0 -> null; otherwise pos clamped into [0, n-1].
import { describe, expect, it } from "vitest";
import type { Run, Step, ToolCall } from "../src/lib/ingest";
import { buildSwimlane, type Swimlane } from "../src/lib/swimlane";
import { buildScrubSteps, clampStep } from "../src/lib/scrubber";

const bar = (stepIndex: number, name: string | null, startMs: number | null, durationMs: number | null, isError: boolean) => ({
  stepIndex, lane: name ?? "unknown", name, startMs, durationMs, isError,
});
// Hand-computed: bars 1 and 4 are unplaced (startMs null) and must be skipped; positions are 0..3 over the 4 placed bars.
const handBars = [bar(0, "Read", 0, 500, false), bar(0, "Bash", null, 40, true), bar(1, "Bash", 1000, null, true), bar(2, null, 2500, 100, false), bar(2, "Grep", null, null, false), bar(3, "Edit", 4000, 0, false)];
const hand: Swimlane = { lanes: ["Read", "Bash", "unknown", "Grep", "Edit"], bars: handBars, spanMs: 4000, unplaced: 2 };

describe("HL-015b B1: buildScrubSteps", () => {
  it("returns one step per placed bar, in bar order, with 0-based positions", () => {
    const steps = buildScrubSteps(hand);
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.position)).toEqual([0, 1, 2, 3]);
    expect(steps.map((s) => s.stepIndex)).toEqual([0, 1, 2, 3]);
  });
  it("copies tool name, duration and error flag; null name and null duration stay null", () => {
    const steps = buildScrubSteps(hand);
    expect(steps[0]).toMatchObject({ position: 0, stepIndex: 0, name: "Read", durationMs: 500, isError: false });
    expect(steps[1]).toMatchObject({ position: 1, stepIndex: 1, name: "Bash", durationMs: null, isError: true });
    expect(steps[2]).toMatchObject({ position: 2, stepIndex: 2, name: null, durationMs: 100, isError: false });
    expect(steps[3]).toMatchObject({ position: 3, stepIndex: 3, name: "Edit", durationMs: 0, isError: false });
  });
  it("returns [] when no bar is placed, and [] for a swimlane with no bars", () => {
    expect(buildScrubSteps({ lanes: ["Grep"], bars: [bar(0, "Grep", null, 7, false)], spanMs: null, unplaced: 1 })).toEqual([]);
    expect(buildScrubSteps({ lanes: [], bars: [], spanMs: null, unplaced: 0 })).toEqual([]);
  });
  it("does not mutate its input (deep-frozen swimlane, same snapshot after)", () => {
    const frozen = JSON.parse(JSON.stringify(hand)) as Swimlane;
    for (const b of frozen.bars) Object.freeze(b);
    Object.freeze(frozen.bars); Object.freeze(frozen.lanes); Object.freeze(frozen);
    const before = JSON.stringify(frozen);
    expect(() => buildScrubSteps(frozen)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
  });
  it("agrees with buildSwimlane on a parsed run (placed bars only, same order)", () => {
    const c = (name: string | null, startedAt: string | null, durationMs: number | null, isError: boolean | null): ToolCall => ({ id: null, name, startedAt, endedAt: null, durationMs, isError, skill: null });
    const st = (index: number, toolCalls: ToolCall[]): Step => ({ index, timestamp: null, text: null, usage: null, toolCalls, sourceLines: [index + 2] });
    const steps = [
      st(0, [c("Read", "2026-10-01T00:00:01.000Z", 500, false), c("Grep", null, 9, false)]),
      st(1, [c(null, "2026-10-01T00:00:03.000Z", null, true), c("Bash", "2026-10-01T00:00:02.000Z", 1500, null)]),
    ];
    const run: Run = { harness: "claude-code", id: "run-scrub-01", startedAt: "2026-10-01T00:00:00.000Z", endedAt: null, durationMs: null, steps, toolCalls: steps.flatMap((s) => s.toolCalls), usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0 };
    const sw = buildSwimlane(run);
    const got = buildScrubSteps(sw);
    expect(got.map((s) => [s.position, s.stepIndex, s.name, s.durationMs, s.isError])).toEqual([
      [0, 0, "Read", 500, false],
      [1, 1, null, null, true],
      [2, 1, "Bash", 1500, false],
    ]);
  });
});

describe("HL-015b B1: clampStep", () => {
  it("passes in-range positions through", () => {
    expect(clampStep(0, 4)).toBe(0);
    expect(clampStep(2, 4)).toBe(2);
    expect(clampStep(3, 4)).toBe(3);
  });
  it("clamps below 0 to 0 and above n-1 to n-1", () => {
    expect(clampStep(-1, 4)).toBe(0);
    expect(clampStep(-100, 4)).toBe(0);
    expect(clampStep(4, 4)).toBe(3);
    expect(clampStep(99, 4)).toBe(3);
    expect(clampStep(5, 1)).toBe(0);
    expect(clampStep(-5, 1)).toBe(0);
  });
  it("returns null when n is 0, whatever the position", () => {
    expect(clampStep(0, 0)).toBeNull();
    expect(clampStep(3, 0)).toBeNull();
    expect(clampStep(-3, 0)).toBeNull();
  });
});
