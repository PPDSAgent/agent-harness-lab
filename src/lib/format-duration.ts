export const DASH = "—";

/** ms -> "123 ms" / "59.9 s" / "1 min 0 s"; null -> "—". Moved unchanged from HL-010a's runs-list. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return DASH;
  if (ms < 1000) return `${ms} ms`;
  const tenths = Math.round(ms / 100);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)} s`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)} min ${total % 60} s`;
}
