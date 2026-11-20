// FROZEN acceptance tests for HL-015a A1 (pure swimlane layout). Builder may not edit this file.
// All inline data is SYNTHETIC. Expected numbers are hand-computed (see the comments), not derived from the code.
// CONTRACT: src/lib/swimlane.ts exports buildSwimlane(run: Run) =>
//   { lanes: string[]; bars: SwimlaneBar[]; spanMs: number | null; unplaced: number }
//   SwimlaneBar = { stepIndex, lane, name, startMs, durationMs, isError }.
import { describe, expect, it } from "vitest";
import type { Run, Step, ToolCall } from "../src/lib/ingest";
import { buildSwimlane } from "../src/lib/swimlane";

const call = (name: string | null, startedAt: string | null, endedAt: string | null, durationMs: number | null, isError: boolean | null): ToolCall => ({
  id: null, name, startedAt, endedAt, durationMs, isError, skill: null,
});
const step = (index: number, toolCalls: ToolCall[]): Step => ({ index, timestamp: null, text: null, usage: null, toolCalls, sourceLines: [index + 2] });
function mk(over: Partial<Run>): Run {
  const steps = over.steps ?? [];
  return {
    harness: "claude-code", id: "run-synthetic", startedAt: null, endedAt: null, durationMs: null,
    steps, toolCalls: steps.flatMap((s) => s.toolCalls), usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0, ...over,
  };
}
const T = (s: string) => `2026-10-01T00:00:${s}Z`;

// Origin = run.startedAt = 00:00:00.000.
//  c1 Read   +1000 ms, dur 500                      -> start 1000, dur 500,  ok
//  c2 Bash   +2000 ms, dur null, ended +4500 ms     -> start 2000, dur 2500 (difference), error
//  c3 null   +3000 ms, dur 100, isError null        -> lane "unknown", start 3000, dur 100, not error
//  c4 Read   no startedAt, dur 50                   -> start null, dur 50, unplaced
//  c5 Bash   startedAt unparseable, nothing else    -> start null, dur null, unplaced
//  c6 Read   +10000 ms, no dur, no end, error       -> start 10000, dur null, error
const run1 = mk({
  startedAt: T("00.000"),
  steps: [
    step(0, [call("Read", T("01.000"), null, 500, false), call("Bash", T("02.000"), T("04.500"), null, true)]),
    step(1, [call(null, T("03.000"), null, 100, null), call("Read", null, null, 50, false), call("Bash", "not-a-date", null, null, false), call("Read", T("10.000"), null, null, true)]),
  ],
});

describe("HL-015a A1: buildSwimlane layout", () => {
  const r = buildSwimlane(run1);
  it("one bar per tool call, in step order then call order, with step index and lane", () => {
    expect(r.bars.map((b) => [b.stepIndex, b.lane, b.name])).toEqual([
      [0, "Read", "Read"], [0, "Bash", "Bash"], [1, "unknown", null], [1, "Read", "Read"], [1, "Bash", "Bash"], [1, "Read", "Read"],
    ]);
  });
  it("lanes list each lane once, in order of first appearance; a null name is the lane unknown", () => {
    expect(r.lanes).toEqual(["Read", "Bash", "unknown"]);
  });
  it("startMs is startedAt minus run.startedAt in ms; missing or unparseable startedAt is null", () => {
    expect(r.bars.map((b) => b.startMs)).toEqual([1000, 2000, 3000, null, null, 10000]);
  });
  it("durationMs: the call's durationMs; else endedAt minus startedAt; else null (never 0 or NaN)", () => {
    expect(r.bars.map((b) => b.durationMs)).toEqual([500, 2500, 100, 50, null, null]);
  });
  it("isError is true only when the call's isError === true", () => {
    expect(r.bars.map((b) => b.isError)).toEqual([false, true, false, false, false, true]);
  });
  it("spanMs is the max over placed bars of start + (duration ?? 0); unplaced counts calls without a start", () => {
    expect(r.spanMs).toBe(10000);
    expect(r.unplaced).toBe(2);
  });
  it("does not mutate its input", () => {
    const before = JSON.stringify(run1);
    buildSwimlane(run1);
    expect(JSON.stringify(run1)).toBe(before);
  });
});

describe("HL-015a A1: origin and edge cases", () => {
  it("with run.startedAt null the origin is the earliest parseable call startedAt", () => {
    // earliest = 00:00:03.000 -> starts 2000 and 0; span = max(2000 + 1000, 0 + 0) = 3000
    const r = buildSwimlane(mk({ steps: [step(0, [call("A", T("05.000"), null, 1000, false), call("B", T("03.000"), null, null, false)])] }));
    expect(r.bars.map((b) => b.startMs)).toEqual([2000, 0]);
    expect(r.spanMs).toBe(3000);
  });
  it("with run.startedAt unparseable the origin falls back to the earliest call too", () => {
    const r = buildSwimlane(mk({ startedAt: "garbage", steps: [step(0, [call("A", T("07.250"), null, 10, false), call("B", T("07.000"), null, 10, false)])] }));
    expect(r.bars.map((b) => b.startMs)).toEqual([250, 0]);
  });
  it("a zero duration stays 0 and a call that starts before the run origin is not clamped", () => {
    const r = buildSwimlane(mk({ startedAt: T("05.000"), steps: [step(0, [call("A", T("06.000"), null, 0, false), call("B", T("04.000"), null, 200, false)])] }));
    expect(r.bars.map((b) => b.durationMs)).toEqual([0, 200]);
    expect(r.bars.map((b) => b.startMs)).toEqual([1000, -1000]);
    expect(r.spanMs).toBe(1000);
  });
  it("no placed bar -> spanMs null, all calls unplaced but still in bars; no steps -> empty result", () => {
    const r = buildSwimlane(mk({ steps: [step(0, [call("A", null, null, 5, false), call(null, null, null, null, true)])] }));
    expect(r.spanMs).toBeNull();
    expect(r.unplaced).toBe(2);
    expect(r.bars).toHaveLength(2);
    expect(r.lanes).toEqual(["A", "unknown"]);
    const e = buildSwimlane(mk({}));
    expect(e).toEqual({ lanes: [], bars: [], spanMs: null, unplaced: 0 });
  });
  it("never emits NaN or undefined numbers", () => {
    const s = JSON.stringify(buildSwimlane(run1).bars);
    expect(s).not.toMatch(/NaN|undefined/);
  });
});
