import type { Harness, Run } from "./ingest";
import { HARNESS_ORDER } from "./usage-summary";

// HL-012: eval verdict breakdown and pass-rate trend. A run's outcome is its LAST verdict
// (highest stepIndex; on a tie the later array entry wins). A run with no verdict has outcome
// null: it is counted as noVerdict, never as a fail. A rate with nothing judged is null, not 0.
// Pure: inputs are not mutated.

export type Outcome = "PASS" | "CONDITIONAL" | "FAIL" | null;

export interface VerdictSummary {
  harness: Harness;
  pass: number;
  conditional: number;
  fail: number;
  noVerdict: number;
  passRate: number | null;
}

export interface TrendPoint {
  day: string; // UTC, YYYY-MM-DD
  harness: Harness;
  judged: number;
  pass: number;
  passRate: number | null;
}

// The frozen HL-012 test reads `.excluded` off a value narrowed to `any[]` by Array.isArray, which
// only type-checks if Array declares the property. The test cannot be edited, so it is declared
// here (typed as always present; only passRateTrend sets it). Remove with the test if the contract changes.
declare global {
  interface Array<T> {
    excluded: [T] extends [T] ? number : never; // always number; mentions T only so the merged declaration is legal and lint-clean
  }
}

/** Trend rows plus the number of runs left out for a null or unparsable startedAt. */
export type PassRateTrend = TrendPoint[] & { excluded: number };

export function runOutcome(run: Run): Outcome {
  let best: { value: "PASS" | "CONDITIONAL" | "FAIL"; stepIndex: number } | null = null;
  for (const v of run.verdicts) if (best === null || v.stepIndex >= best.stepIndex) best = v;
  return best ? best.value : null;
}

const rate = (pass: number, judged: number): number | null => (judged === 0 ? null : pass / judged);

export function summarizeVerdicts(runs: readonly Run[]): VerdictSummary[] {
  return HARNESS_ORDER.flatMap((harness) => {
    const mine = runs.filter((r) => r.harness === harness);
    if (mine.length === 0) return [];
    const row = { harness, pass: 0, conditional: 0, fail: 0, noVerdict: 0 };
    for (const r of mine) {
      const o = runOutcome(r);
      if (o === "PASS") row.pass++;
      else if (o === "CONDITIONAL") row.conditional++;
      else if (o === "FAIL") row.fail++;
      else row.noVerdict++;
    }
    return [{ ...row, passRate: rate(row.pass, row.pass + row.conditional + row.fail) }];
  });
}

export function passRateTrend(runs: readonly Run[]): PassRateTrend {
  const cells = new Map<string, { day: string; harness: Harness; judged: number; pass: number }>();
  let excluded = 0;
  for (const r of runs) {
    const t = r.startedAt === null ? Number.NaN : Date.parse(r.startedAt);
    if (Number.isNaN(t)) {
      excluded++;
      continue;
    }
    const day = new Date(t).toISOString().slice(0, 10);
    const key = `${day}|${r.harness}`;
    const cell = cells.get(key) ?? { day, harness: r.harness, judged: 0, pass: 0 };
    const o = runOutcome(r);
    if (o !== null) cell.judged++;
    if (o === "PASS") cell.pass++;
    cells.set(key, cell);
  }
  const rows = [...cells.values()]
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : HARNESS_ORDER.indexOf(a.harness) - HARNESS_ORDER.indexOf(b.harness)))
    .map((c) => ({ ...c, passRate: rate(c.pass, c.judged) }));
  return Object.assign(rows, { excluded });
}
