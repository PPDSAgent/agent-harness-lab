// @vitest-environment node
// FROZEN acceptance tests for HL-014 A1 (pure summary). Builder may not edit this file.
// CONTRACT: src/lib/harness-comparison.ts exports compareHarnesses(runs: readonly Run[]) returning one row per
// HARNESS_ORDER entry (claude-code, codex, team), in that order. Row fields: harness, runs, toolCallErrorRate,
// medianDurationMs, p95DurationMs, medianTokens, verdictPassRate, unsupportedClaimShare. Rates are fractions 0..1.
// An empty denominator or value set gives null, never 0 or NaN. Expected numbers below are hand-computed.
// All data is SYNTHETIC.
import { describe, expect, it } from "vitest";
import { compareHarnesses } from "../src/lib/harness-comparison";
import type { Claim, Harness, Run, ToolCall, Verdict } from "../src/lib/ingest";

const tc = (isError: boolean | null): ToolCall => ({ id: null, name: null, startedAt: null, endedAt: null, durationMs: null, isError, skill: null });
const vd = (value: Verdict["value"]): Verdict => ({ value, stepIndex: 0 });
const cl = (hasEvidence: boolean): Claim => ({ text: "synthetic claim", hasEvidence, stepIndex: 0 });
function mk(harness: Harness, id: string, o: { dur?: number | null; tokens?: number | null; calls?: (boolean | null)[]; verdicts?: Verdict["value"][]; claims?: boolean[] }): Run {
  return {
    harness, id, startedAt: null, endedAt: null, durationMs: o.dur ?? null,
    steps: [], toolCalls: (o.calls ?? []).map(tc),
    usage: o.tokens === undefined || o.tokens === null ? null : { inputTokens: null, outputTokens: null, totalTokens: o.tokens },
    verdicts: (o.verdicts ?? []).map(vd), claims: (o.claims ?? []).map(cl), recordCount: 0, droppedCount: 0,
  };
}

// claude-code: durations [2000,4000,6000] (one null excluded), tokens [100,300,500] (one null excluded),
// tool calls with isError non-null: 5, errors 2 -> 0.4; verdicts 3 PASS of 5 -> 0.6; claims 2 unsupported of 4 -> 0.5.
// median = nearest-rank p50 of 3 = 4000; p95 = rank ceil(2.85)=3 -> 6000; token median 300.
const RUNS: Run[] = [
  mk("claude-code", "run-a", { dur: 2000, tokens: 100, calls: [true, false], verdicts: ["PASS", "PASS"], claims: [true, false] }),
  mk("claude-code", "run-b", { dur: 4000, tokens: 300, calls: [false, null], verdicts: ["FAIL"], claims: [false] }),
  mk("claude-code", "run-c", { dur: null, tokens: null, calls: [true], verdicts: ["CONDITIONAL"] }),
  mk("claude-code", "run-d", { dur: 6000, tokens: 500, calls: [false], verdicts: ["PASS"], claims: [true] }),
  mk("codex", "run-e", {}),
];

describe("HL-014 A1: compareHarnesses", () => {
  it("returns exactly one row per harness in HARNESS_ORDER, even with no runs", () => {
    expect(compareHarnesses([]).map((r) => r.harness)).toEqual(["claude-code", "codex", "team"]);
    expect(compareHarnesses(RUNS).map((r) => r.harness)).toEqual(["claude-code", "codex", "team"]);
    const reversed = compareHarnesses([...RUNS].reverse());
    expect(reversed.map((r) => r.harness)).toEqual(["claude-code", "codex", "team"]);
  });

  it("counts runs per harness", () => {
    const rows = compareHarnesses(RUNS);
    expect(rows.map((r) => r.runs)).toEqual([4, 1, 0]);
  });

  it("computes the hand-checked values for claude-code (null durations and tokens excluded)", () => {
    const row = compareHarnesses(RUNS)[0]!;
    expect(row.toolCallErrorRate).toBeCloseTo(0.4, 9);
    expect(row.medianDurationMs).toBe(4000);
    expect(row.p95DurationMs).toBe(6000);
    expect(row.medianTokens).toBe(300);
    expect(row.verdictPassRate).toBeCloseTo(0.6, 9);
    expect(row.unsupportedClaimShare).toBeCloseTo(0.5, 9);
  });

  it("gives null (not 0 or NaN) for every metric with an empty denominator or value set", () => {
    const rows = compareHarnesses(RUNS);
    for (const row of [rows[1]!, rows[2]!]) {
      expect(row.toolCallErrorRate).toBeNull();
      expect(row.medianDurationMs).toBeNull();
      expect(row.p95DurationMs).toBeNull();
      expect(row.medianTokens).toBeNull();
      expect(row.verdictPassRate).toBeNull();
      expect(row.unsupportedClaimShare).toBeNull();
    }
    const empty = compareHarnesses([]);
    for (const row of empty) {
      expect(row.runs).toBe(0);
      expect(row.medianDurationMs).toBeNull();
      expect(row.verdictPassRate).toBeNull();
    }
  });

  it("a tool-call list whose isError values are all null has a null error rate", () => {
    const row = compareHarnesses([mk("team", "run-f", { calls: [null, null] })])[2]!;
    expect(row.toolCallErrorRate).toBeNull();
  });

  it("a real zero is 0, not null: no errors, no passes, no unsupported claims", () => {
    const row = compareHarnesses([mk("codex", "run-g", { calls: [false, false], verdicts: ["FAIL", "CONDITIONAL"], claims: [true], dur: 0 })])[1]!;
    expect(row.toolCallErrorRate).toBe(0);
    expect(row.verdictPassRate).toBe(0);
    expect(row.unsupportedClaimShare).toBe(0);
    expect(row.medianDurationMs).toBe(0);
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(RUNS);
    const copy = [...RUNS];
    compareHarnesses(RUNS);
    expect(JSON.stringify(RUNS)).toBe(before);
    expect(RUNS).toEqual(copy);
  });
});
