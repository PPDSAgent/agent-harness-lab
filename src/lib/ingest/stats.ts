// Nearest-rank percentiles (HL-005). For n sorted values, percentile(q) is the value at
// 1-based rank ceil(q/100 * n). Empty input -> null. Input is not mutated.

export function percentile(values: readonly number[], q: number): number | null {
  const n = values.length;
  if (n === 0 || !(q > 0 && q <= 100)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Round to 9 places before ceil so float noise (e.g. 0.29 * 100 = 28.999...) cannot shift a rank.
  const rank = Math.ceil(Math.round((q / 100) * n * 1e9) / 1e9);
  return sorted[Math.min(Math.max(rank, 1), n) - 1] ?? null;
}

export const p50 = (values: readonly number[]): number | null => percentile(values, 50);
export const p95 = (values: readonly number[]): number | null => percentile(values, 95);
export const p99 = (values: readonly number[]): number | null => percentile(values, 99);
