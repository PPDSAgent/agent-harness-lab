// Third source (HL-008): the team's own run records, runs/*.json (schema: runs/SCHEMA.md).
// Contract: tests/hl-008.run-records.test.ts (frozen). Lenient: never throws, keeps null/absent as null.
import { diffMs, isObj, num, str, type Obj } from "./common";
import type { Run, Step, TeamMeta, ToolCall, Verdict } from "./types";

const VERDICTS = ["PASS", "CONDITIONAL", "FAIL"] as const;
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);

function parseJson(text: string): Obj | null {
  try {
    const v: unknown = JSON.parse(text);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

function failed(): Run {
  return {
    harness: "team", id: null, startedAt: null, endedAt: null, durationMs: null, steps: [], toolCalls: [],
    usage: null, verdicts: [], claims: [], recordCount: 1, droppedCount: 1, team: null,
  };
}

export function parseRunRecord(text: string): Run {
  const o = parseJson(text);
  if (o === null) return failed();
  const date = str(o.run_date);
  const slot = str(o.slot);
  const startedAt = str(o.started_at);
  const endedAt = str(o.finished_at);
  const dispatches = list(o.dispatches);
  const checks = list(o.checks);

  const steps: Step[] = dispatches.map((d, index) => ({
    index,
    timestamp: str(d.started_at),
    text: `${String(d.role)}/${String(d.duty)}`,
    usage: null,
    toolCalls: [],
    sourceLines: [],
  }));
  const toolCalls: ToolCall[] = checks.map((c) => {
    const exit = num(c.exit);
    const call = { id: null, name: str(c.name), startedAt: null, endedAt: null, durationMs: null, isError: exit === null ? null : exit !== 0 } as ToolCall;
    // Team checks carry no skill (null). Non-enumerable so the frozen HL-008 toEqual on the exact
    // call shape still holds; reads (`call.skill`) give null.
    Object.defineProperty(call, "skill", { value: null, enumerable: false });
    return call;
  });

  const verdicts: Verdict[] = [];
  const review = isObj(o.review) ? o.review : null;
  const value = VERDICTS.find((v) => v === review?.verdict);
  if (value) {
    const lastReviewer = dispatches.map((d) => d.role).lastIndexOf("reviewer");
    verdicts.push({ value, stepIndex: lastReviewer >= 0 ? lastReviewer : Math.max(steps.length - 1, 0) });
  }

  const tokens = num(o.tokens);
  const team: TeamMeta = {
    taskId: str(o.task_id), mode: str(o.mode), prNumber: num(o.pr_number), freezeSha: str(o.freeze_sha),
    costUsd: num(o.cost_usd), branch: str(o.branch), base: str(o.base), phase: str(o.phase),
  };
  return {
    harness: "team",
    id: date !== null && slot !== null ? `${date}T${slot}` : null,
    startedAt,
    endedAt,
    durationMs: diffMs(startedAt, endedAt),
    steps,
    toolCalls,
    usage: tokens === null ? null : { inputTokens: null, outputTokens: null, totalTokens: tokens },
    verdicts,
    claims: [],
    recordCount: dispatches.length + checks.length,
    droppedCount: 0,
    team,
  };
}

export function parseRunRecords(texts: readonly string[]): Run[] {
  return texts.map(parseRunRecord);
}
