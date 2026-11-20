import type { Swimlane } from "./swimlane";

export type ScrubStep = { position: number; stepIndex: number; name: string | null; durationMs: number | null; isError: boolean };

/** Ordered scrub steps: one per placed bar (non-null startMs), in bar order. Does not mutate `swimlane`. */
export function buildScrubSteps(swimlane: Swimlane): ScrubStep[] {
  return swimlane.bars
    .filter((b) => b.startMs !== null)
    .map((b, position) => ({ position, stepIndex: b.stepIndex, name: b.name, durationMs: b.durationMs, isError: b.isError }));
}

/** Clamp `pos` into [0, n-1]; null when there are no steps. NaN maps to 0; Infinity clamps to n-1. */
export function clampStep(pos: number, n: number): number | null {
  if (n <= 0) return null;
  if (Number.isNaN(pos)) return 0;
  return Math.min(n - 1, Math.max(0, pos));
}
