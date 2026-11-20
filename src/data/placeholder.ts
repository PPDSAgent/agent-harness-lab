// SYNTHETIC in-memory placeholder data. Not measured; replaced by fixtures in later tasks.
export interface PlaceholderPoint {
  /** Day index within the synthetic window (0-based). */
  day: number;
  /** Synthetic p50 request latency in milliseconds. */
  p50Ms: number;
}

/** Date (UTC, ISO 8601) the static array below was authored by hand; not a runtime value. */
export const generatedAt = "2026-11-02";

export const placeholderSeries: PlaceholderPoint[] = [
  { day: 0, p50Ms: 412 },
  { day: 1, p50Ms: 398 },
  { day: 2, p50Ms: 421 },
  { day: 3, p50Ms: 376 },
  { day: 4, p50Ms: 359 },
  { day: 5, p50Ms: 384 },
  { day: 6, p50Ms: 341 },
  { day: 7, p50Ms: 330 },
];
