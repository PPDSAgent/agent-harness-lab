// @vitest-environment node
// FROZEN acceptance tests for HL-010a (runs list: row model + fixture loader).
// Written by the test engineer before the build; the builder may not edit this file.
// All inline data is SYNTHETIC. Fixture sets are the HL-003/HL-004 outputs in fixtures/.
//
// CONTRACT (fixed here so the builder has names):
//   src/lib/runs-list.ts
//     export interface RunRow { harness: Run["harness"]; id: string|null; startedAt: string|null;
//       durationMs: number|null; stepCount: number; toolCallCount: number; errorCount: number }
//     export function toRunRows(runs: Run[]): RunRow[]
//       - one row per run; null id/startedAt/durationMs stay null (never "", 0 or invented)
//       - stepCount = run.steps.length; toolCallCount = run.toolCalls.length
//       - errorCount = number of run.toolCalls with isError === true (null and false do not count)
//       - sorted by startedAt, newest first; rows with null startedAt come last
//       - does not mutate the input array
//   src/lib/load-fixture-runs.ts
//     export function loadFixtureRuns(): Run[]
//       - synchronous; parses every fixtures/claude-code/*.jsonl with parseClaudeCode and every
//         fixtures/codex/*.jsonl with parseCodex (README.md files are not fixtures).
//         Under Vite use import.meta.glob(..., { query: "?raw", import: "default", eager: true }).
import { describe, expect, it } from "vitest";
import type { Run, ToolCall } from "../src/lib/ingest";
import { toRunRows } from "../src/lib/runs-list";
import { loadFixtureRuns } from "../src/lib/load-fixture-runs";

const call = (isError: boolean | null): ToolCall => ({
  id: null, name: "t", startedAt: null, endedAt: null, durationMs: null, isError,
});
function mk(over: Partial<Run>): Run {
  return {
    harness: "claude-code", id: "id", startedAt: null, endedAt: null, durationMs: null,
    steps: [], toolCalls: [], usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0,
    ...over,
  };
}
const step = (index: number) => ({ index, timestamp: null, text: null, usage: null, toolCalls: [], sourceLines: [index + 2] });

describe("HL-010a toRunRows", () => {
  it("maps counts: stepCount, toolCallCount and errorCount (only isError === true)", () => {
    const run = mk({
      id: "run-a", harness: "codex", startedAt: "2026-10-01T00:00:00.000Z", durationMs: 4200,
      steps: [step(0), step(1), step(2)],
      toolCalls: [call(true), call(false), call(null), call(true), call(false)],
    });
    expect(toRunRows([run])).toEqual([
      { harness: "codex", id: "run-a", startedAt: "2026-10-01T00:00:00.000Z", durationMs: 4200, stepCount: 3, toolCallCount: 5, errorCount: 2 },
    ]);
  });

  it("preserves null id, startedAt and durationMs, and counts zero for an empty run", () => {
    const [row] = toRunRows([mk({ id: null })]);
    expect(row).toEqual({ harness: "claude-code", id: null, startedAt: null, durationMs: null, stepCount: 0, toolCallCount: 0, errorCount: 0 });
  });

  it("sorts newest startedAt first, with null startedAt last", () => {
    const rows = toRunRows([
      mk({ id: "null-1", startedAt: null }),
      mk({ id: "old", startedAt: "2026-10-01T00:00:00.000Z" }),
      mk({ id: "new", startedAt: "2026-10-09T00:00:00.000Z" }),
      mk({ id: "mid", startedAt: "2026-10-05T12:00:00.000Z" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["new", "mid", "old", "null-1"]);
  });

  it("returns one row per run and does not mutate its input", () => {
    const input = [mk({ id: "a", startedAt: "2026-10-01T00:00:00.000Z" }), mk({ id: "b", startedAt: "2026-10-02T00:00:00.000Z" })];
    const before = input.map((r) => r.id);
    expect(toRunRows(input)).toHaveLength(2);
    expect(input.map((r) => r.id)).toEqual(before);
    expect(toRunRows([])).toEqual([]);
  });
});

describe("HL-010a loadFixtureRuns", () => {
  const runs = loadFixtureRuns();
  it("loads 60 claude-code and 30 codex fixture runs (90 total)", () => {
    expect(runs.filter((r) => r.harness === "claude-code")).toHaveLength(60);
    expect(runs.filter((r) => r.harness === "codex")).toHaveLength(30);
    expect(runs).toHaveLength(90);
  });
  it("fixture runs have no dropped records and yield 90 rows through toRunRows", () => {
    expect(runs.every((r) => r.droppedCount === 0)).toBe(true);
    const rows = toRunRows(runs);
    expect(rows).toHaveLength(90);
    expect(rows.every((r) => r.id !== null && r.startedAt !== null)).toBe(true);
  });
});
