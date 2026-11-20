// Shared, dependency-free validation for the series-chart MCP App (HL-030a).
// Used by the server (tool input) and by the view (structured content), so both
// sides agree on what a valid series is. Pure: no DOM, no Node, no SDK.

export type SeriesPoint = { t: string; y: number };
export type SeriesData = { title?: string; series: SeriesPoint[] };

export const MIN_POINTS = 2;
export const MAX_POINTS = 500;

// ISO-8601 calendar date, optionally followed by a time and zone (the task's "ISO-8601 date string").
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Epoch milliseconds for a valid ISO-8601 string, else null (rejects impossible dates such as 2026-02-30). */
export function parseIso(t: unknown): number | null {
  if (typeof t !== "string") return null;
  const m = ISO.exec(t);
  if (!m) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return ms;
}

export type Parsed = { ok: true; data: SeriesData } | { ok: false; reason: string };

/** Validate unknown input and return the series sorted ascending by time (stable for equal times). */
export function parseSeriesData(input: unknown): Parsed {
  if (typeof input !== "object" || input === null) return { ok: false, reason: "expected an object with a series array" };
  const { series, title } = input as { series?: unknown; title?: unknown };
  if (!Array.isArray(series)) return { ok: false, reason: "series must be an array of {t, y} points" };
  if (series.length < MIN_POINTS) return { ok: false, reason: `series needs at least ${MIN_POINTS} points (got ${series.length})` };
  if (series.length > MAX_POINTS) return { ok: false, reason: `series allows at most ${MAX_POINTS} points (got ${series.length})` };
  if (title !== undefined && typeof title !== "string") return { ok: false, reason: "title must be a string when given" };
  const pts: Array<SeriesPoint & { ms: number }> = [];
  for (let i = 0; i < series.length; i++) {
    const p = series[i] as { t?: unknown; y?: unknown } | null;
    if (typeof p !== "object" || p === null) return { ok: false, reason: `point ${i} is not an object` };
    const ms = parseIso(p.t);
    if (ms === null) return { ok: false, reason: `point ${i} has an unparseable ISO-8601 date` };
    if (typeof p.y !== "number" || !Number.isFinite(p.y)) return { ok: false, reason: `point ${i} has a y that is not a finite number` };
    pts.push({ t: p.t as string, y: p.y, ms });
  }
  pts.sort((a, b) => a.ms - b.ms);
  const data: SeriesData = { series: pts.map(({ t, y }) => ({ t, y })) };
  if (title !== undefined && title !== "") data.title = title;
  return { ok: true, data };
}
