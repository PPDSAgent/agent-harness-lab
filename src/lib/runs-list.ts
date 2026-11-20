import type { Run } from "./ingest";

export interface RunRow {
  harness: Run["harness"];
  id: string | null;
  startedAt: string | null;
  durationMs: number | null;
  stepCount: number;
  toolCallCount: number;
  errorCount: number;
}

/** Runs newest startedAt first, null startedAt last. Stable, so ties keep input order; input is not mutated. */
export function sortRuns(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => {
    if (a.startedAt === b.startedAt) return 0;
    if (a.startedAt === null) return 1;
    if (b.startedAt === null) return -1;
    return Date.parse(b.startedAt) - Date.parse(a.startedAt);
  });
}

/** One row per run, in sortRuns order. Nulls stay null; input is not mutated. */
export function toRunRows(runs: Run[]): RunRow[] {
  return sortRuns(runs).map((r) => ({
    harness: r.harness,
    id: r.id,
    startedAt: r.startedAt,
    durationMs: r.durationMs,
    stepCount: r.steps.length,
    toolCallCount: r.toolCalls.length,
    errorCount: r.toolCalls.filter((c) => c.isError === true).length,
  }));
}
