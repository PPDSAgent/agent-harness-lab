import type { Harness, Run } from "./ingest";
import { percentile } from "./ingest";
import { HARNESS_ORDER } from "./usage-summary";

// HL-014: one row per harness for the side-by-side view. Rates are fractions 0..1; an empty
// denominator or value set is null, never 0 or NaN. Percentiles are the HL-005 nearest-rank
// helper. Pure: inputs are not mutated.

export interface HarnessComparisonRow {
  harness: Harness;
  runs: number;
  toolCallErrorRate: number | null;
  medianDurationMs: number | null;
  p95DurationMs: number | null;
  medianTokens: number | null;
  verdictPassRate: number | null;
  unsupportedClaimShare: number | null;
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);
const finite = (values: readonly (number | null | undefined)[]): number[] =>
  values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

export function compareHarnesses(runs: readonly Run[]): HarnessComparisonRow[] {
  return HARNESS_ORDER.map((harness) => {
    const mine = runs.filter((r) => r.harness === harness);
    const calls = mine.flatMap((r) => r.toolCalls).filter((c) => c.isError !== null);
    const verdicts = mine.flatMap((r) => r.verdicts);
    const claims = mine.flatMap((r) => r.claims);
    const durations = finite(mine.map((r) => r.durationMs));
    const tokens = finite(mine.map((r) => r.usage?.totalTokens));
    return {
      harness,
      runs: mine.length,
      toolCallErrorRate: ratio(calls.filter((c) => c.isError === true).length, calls.length),
      medianDurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
      medianTokens: percentile(tokens, 50),
      verdictPassRate: ratio(verdicts.filter((v) => v.value === "PASS").length, verdicts.length),
      unsupportedClaimShare: ratio(claims.filter((c) => c.hasEvidence === false).length, claims.length),
    };
  });
}
