// HL-020: pure logic for the recurring P1 stop check (PLAN.md, Project 1, Stop rule P1).
// Contract: tests/hl-020.stop-check.test.ts (frozen). No I/O here.
import type { P1Answers } from "./p1-questions";

export type YesNo = "yes" | "no";
export interface HistoryEntry { date: string; q1: YesNo; q2: YesNo; q3: YesNo }

/** The rule counts checks dated strictly after this day (Fri Nov 6, 2026). */
export const STOP_RULE_AFTER = "2026-11-06";

export const isIsoDate = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

const yn = (status: string): YesNo => (status === "no-data" ? "no" : "yes");

/** A question is answered unless its status is "no-data" (Q1 "no-failures" counts as answered). */
export function answeredFlags(a: P1Answers): [YesNo, YesNo, YesNo] {
  return [yn(a.skillFailures.status), yn(a.runCost.status), yn(a.unsupportedClaims.status)];
}

export function toEntry(date: string, flags: [YesNo, YesNo, YesNo]): HistoryEntry {
  return { date, q1: flags[0], q2: flags[1], q3: flags[2] };
}

/** Parse history.jsonl text; lines that are not a valid entry are skipped. */
export function parseHistory(text: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const e = JSON.parse(line) as Partial<HistoryEntry>;
      const ok = (v: unknown) => v === "yes" || v === "no";
      if (typeof e.date === "string" && isIsoDate(e.date) && ok(e.q1) && ok(e.q2) && ok(e.q3)) out.push(e as HistoryEntry);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

/** Tripped when the last three entries are each dated after STOP_RULE_AFTER and each leaves a question unanswered. */
export function stopRuleTripped(history: readonly HistoryEntry[]): boolean {
  const last = history.slice(-3);
  return last.length === 3 && last.every((e) => e.date > STOP_RULE_AFTER && [e.q1, e.q2, e.q3].includes("no"));
}
