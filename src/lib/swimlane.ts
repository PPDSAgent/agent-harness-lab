import type { Run } from "./ingest";

export type SwimlaneBar = {
  stepIndex: number;
  lane: string;
  name: string | null;
  /** ms from the run origin; null when the call has no parseable startedAt. */
  startMs: number | null;
  durationMs: number | null;
  isError: boolean;
};

export type Swimlane = { lanes: string[]; bars: SwimlaneBar[]; spanMs: number | null; unplaced: number };

const parse = (iso: string | null): number | null => {
  if (iso === null) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** Pure layout for the run swimlane: one bar per tool call, lanes by tool name. Does not mutate `run`. */
export function buildSwimlane(run: Run): Swimlane {
  const calls = run.steps.flatMap((s) => s.toolCalls.map((c) => ({ s, c, start: parse(c.startedAt) })));
  const runStart = parse(run.startedAt);
  const starts = calls.flatMap((x) => (x.start === null ? [] : [x.start]));
  const origin = runStart ?? (starts.length > 0 ? Math.min(...starts) : null);

  const lanes: string[] = [];
  const bars: SwimlaneBar[] = calls.map(({ s, c, start }) => {
    const lane = c.name ?? "unknown";
    if (!lanes.includes(lane)) lanes.push(lane);
    const end = parse(c.endedAt);
    const durationMs = c.durationMs ?? (start !== null && end !== null ? end - start : null);
    return {
      stepIndex: s.index,
      lane,
      name: c.name,
      startMs: start !== null && origin !== null ? start - origin : null,
      durationMs,
      isError: c.isError === true,
    };
  });

  const placed = bars.filter((b) => b.startMs !== null);
  const spanMs = placed.length === 0 ? null : Math.max(...placed.map((b) => (b.startMs as number) + (b.durationMs ?? 0)));
  return { lanes, bars, spanMs, unplaced: bars.length - placed.length };
}
