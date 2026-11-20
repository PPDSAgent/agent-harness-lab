import type { Claim, Run, Step, ToolCall, Usage, Verdict } from "./types";

export type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export interface Line {
  line: number; // 1-based physical line number
  obj: Obj | null; // null when the line is not a JSON object
}

function parseObj(l: string): Obj | null {
  try {
    const v: unknown = JSON.parse(l);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

/** Lines after the header (line 1), blank lines skipped. Invalid JSON gives obj null. */
export function readRecords(text: string): { header: Obj | null; records: Line[] } {
  const lines = text.split("\n");
  const header = parseObj(lines[0] ?? "");
  const records: Line[] = [];
  lines.forEach((l, i) => {
    if (i === 0 || l.trim() === "") return;
    records.push({ line: i + 1, obj: parseObj(l) });
  });
  return { header, records };
}

export function diffMs(start: string | null, end: string | null): number | null {
  if (start === null || end === null) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  return Number.isNaN(a) || Number.isNaN(b) ? null : b - a;
}

export function makeUsage(i: unknown, o: unknown, t: unknown): Usage {
  return { inputTokens: num(i), outputTokens: num(o), totalTokens: num(t) };
}

function sumField(vals: (number | null)[]): number | null {
  const present = vals.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

export function sumUsage(steps: Step[]): Usage | null {
  const us = steps.map((s) => s.usage).filter((u): u is Usage => u !== null);
  if (us.length === 0) return null;
  return {
    inputTokens: sumField(us.map((u) => u.inputTokens)),
    outputTokens: sumField(us.map((u) => u.outputTokens)),
    totalTokens: sumField(us.map((u) => u.totalTokens)),
  };
}

export const VERDICT_RE = /REVIEW-VERDICT: (PASS|CONDITIONAL|FAIL)/;

export function scanText(text: string, stepIndex: number, verdicts: Verdict[], claims: Claim[]): void {
  const m = VERDICT_RE.exec(text);
  if (m) verdicts.push({ value: m[1] as Verdict["value"], stepIndex });
  if (text.includes("CLAIM:")) claims.push({ text, hasEvidence: text.includes("EVIDENCE:"), stepIndex });
}

/** Earliest/latest record timestamps (compared as instants, returned as the source strings). */
export function span(stamps: (string | null)[]): Pick<Run, "startedAt" | "endedAt" | "durationMs"> {
  let lo: string | null = null;
  let hi: string | null = null;
  let loT = Infinity;
  let hiT = -Infinity;
  let count = 0;
  for (const s of stamps) {
    if (s === null) continue;
    const t = Date.parse(s);
    if (Number.isNaN(t)) continue;
    count++;
    if (t < loT) {
      loT = t;
      lo = s;
    }
    if (t > hiT) {
      hiT = t;
      hi = s;
    }
  }
  return { startedAt: lo, endedAt: hi, durationMs: count < 2 ? null : hiT - loT };
}

export function newCall(id: string | null, name: string | null, startedAt: string | null, skill: string | null = null): ToolCall {
  return { id, name, startedAt, endedAt: null, durationMs: null, isError: null, skill };
}

export function finishCall(c: ToolCall, endedAt: string | null, isError: boolean): void {
  c.endedAt = endedAt;
  c.durationMs = diffMs(c.startedAt, endedAt);
  c.isError = isError;
}
