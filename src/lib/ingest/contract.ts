// HL-023: strict contract check for the normalized Run (src/lib/ingest/types.ts).
// "Null, never absent": every nullable field must be present as null, never undefined.
// Hand-written on purpose (no dependency). Typed against types.ts: the key tables below are
// Record<keyof T, ...>, so adding or removing a model field breaks the typecheck until updated.
import type { Harness, Run, Step, TeamMeta, ToolCall, Usage, Verdict } from "./types";

export interface ContractResult {
  valid: boolean;
  errors: string[];
}

type Kind = "string|null" | "number|null" | "boolean|null" | "int" | "nonnegint";

const USAGE: Record<keyof Usage, Kind> = {
  inputTokens: "number|null",
  outputTokens: "number|null",
  totalTokens: "number|null",
};
const TOOL_CALL: Record<Exclude<keyof ToolCall, "skill">, Kind> = {
  id: "string|null",
  name: "string|null",
  startedAt: "string|null",
  endedAt: "string|null",
  durationMs: "number|null",
  isError: "boolean|null",
};
const TEAM: Record<keyof TeamMeta, Kind> = {
  taskId: "string|null",
  mode: "string|null",
  prNumber: "number|null",
  freezeSha: "string|null",
  costUsd: "number|null",
  branch: "string|null",
  base: "string|null",
  phase: "string|null",
};
const HARNESSES: readonly Harness[] = ["claude-code", "codex", "team"];
const VERDICTS: readonly Verdict["value"][] = ["PASS", "CONDITIONAL", "FAIL"];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function kindOk(v: unknown, k: Kind): boolean {
  switch (k) {
    case "string|null": return v === null || typeof v === "string";
    case "number|null": return v === null || (typeof v === "number" && Number.isFinite(v));
    case "boolean|null": return v === null || typeof v === "boolean";
    case "int": return typeof v === "number" && Number.isInteger(v);
    case "nonnegint": return typeof v === "number" && Number.isInteger(v) && v >= 0;
  }
}

function fields(o: Record<string, unknown>, table: Record<string, Kind>, path: string, errors: string[]): void {
  for (const [key, kind] of Object.entries(table)) {
    if (!kindOk(o[key], kind)) errors.push(`${path}.${key}: expected ${kind}, got ${describe(o[key])}`);
  }
}

function describe(v: unknown): string {
  if (v === undefined) return "undefined (absent)";
  if (typeof v === "number") return String(v);
  return Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
}

function usage(v: unknown, path: string, errors: string[]): void {
  if (v === null) return;
  if (!isObj(v)) return void errors.push(`${path}: expected object or null, got ${describe(v)}`);
  fields(v, USAGE, path, errors);
}

function toolCall(v: unknown, path: string, errors: string[]): void {
  if (!isObj(v)) return void errors.push(`${path}: expected object, got ${describe(v)}`);
  fields(v, TOOL_CALL, path, errors);
  if (v.skill !== undefined && v.skill !== null && typeof v.skill !== "string") {
    errors.push(`${path}.skill: expected string, null or absent, got ${describe(v.skill)}`);
  }
}

function list(v: unknown, path: string, errors: string[], each: (x: unknown, p: string, e: string[]) => void): void {
  if (!Array.isArray(v)) return void errors.push(`${path}: expected array, got ${describe(v)}`);
  v.forEach((x, i) => each(x, `${path}[${i}]`, errors));
}

function step(v: unknown, path: string, errors: string[]): void {
  if (!isObj(v)) return void errors.push(`${path}: expected object, got ${describe(v)}`);
  const s: Record<keyof Step, Kind | "usage" | "toolCalls" | "lines"> = {
    index: "int", timestamp: "string|null", text: "string|null", usage: "usage", toolCalls: "toolCalls", sourceLines: "lines",
  };
  for (const [key, kind] of Object.entries(s)) {
    const p = `${path}.${key}`;
    if (kind === "usage") usage(v[key], p, errors);
    else if (kind === "toolCalls") list(v[key], p, errors, toolCall);
    else if (kind === "lines") {
      if (!Array.isArray(v[key]) || !(v[key] as unknown[]).every((n) => kindOk(n, "int"))) errors.push(`${p}: expected integer[]`);
    } else if (!kindOk(v[key], kind)) errors.push(`${p}: expected ${kind}, got ${describe(v[key])}`);
  }
}

function verdict(v: unknown, path: string, errors: string[]): void {
  if (!isObj(v)) return void errors.push(`${path}: expected object, got ${describe(v)}`);
  if (!VERDICTS.includes(v.value as Verdict["value"])) errors.push(`${path}.value: expected PASS|CONDITIONAL|FAIL, got ${describe(v.value)}`);
  if (!kindOk(v.stepIndex, "int")) errors.push(`${path}.stepIndex: expected integer`);
}

function claim(v: unknown, path: string, errors: string[]): void {
  if (!isObj(v)) return void errors.push(`${path}: expected object, got ${describe(v)}`);
  if (typeof v.text !== "string") errors.push(`${path}.text: expected string`);
  if (typeof v.hasEvidence !== "boolean") errors.push(`${path}.hasEvidence: expected boolean, got ${describe(v.hasEvidence)}`);
  if (!kindOk(v.stepIndex, "int")) errors.push(`${path}.stepIndex: expected integer`);
}

/** Validate a normalized Run. Never throws, never mutates `value`. */
export function validateRun(value: unknown, expectedHarness?: Harness): ContractResult {
  const errors: string[] = [];
  try {
    if (!isObj(value)) return { valid: false, errors: [`run: expected object, got ${describe(value)}`] };
    const h = value.harness;
    if (!HARNESSES.includes(h as Harness)) errors.push(`harness: expected one of ${HARNESSES.join("|")}, got ${describe(h)}`);
    else if (expectedHarness !== undefined && h !== expectedHarness) errors.push(`harness: expected ${expectedHarness}, got ${String(h)}`);

    const top: Record<"id" | "startedAt" | "endedAt" | "durationMs" | "recordCount" | "droppedCount", Kind> = {
      id: "string|null", startedAt: "string|null", endedAt: "string|null", durationMs: "number|null",
      recordCount: "nonnegint", droppedCount: "nonnegint",
    };
    fields(value, top, "run", errors);
    list(value.steps, "run.steps", errors, step);
    list(value.toolCalls, "run.toolCalls", errors, toolCall);
    usage(value.usage, "run.usage", errors);
    list(value.verdicts, "run.verdicts", errors, verdict);
    list(value.claims, "run.claims", errors, claim);
    if (kindOk(value.recordCount, "nonnegint") && kindOk(value.droppedCount, "nonnegint") &&
        (value.droppedCount as number) > (value.recordCount as number)) {
      errors.push("run.droppedCount: exceeds recordCount");
    }

    const team = value.team;
    if (h === "team") {
      if (team === undefined) errors.push("run.team: key must be present (null or TeamMeta) for team runs");
    }
    if (team !== undefined && team !== null) {
      if (h !== "team") errors.push("run.team: only team runs may carry team metadata");
      else if (!isObj(team)) errors.push(`run.team: expected object or null, got ${describe(team)}`);
      else fields(team, TEAM, "run.team", errors);
    }
  } catch (e) {
    errors.push(`validator error: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { valid: errors.length === 0, errors };
}

// Compile-time tie to the model: a Run key added or removed in types.ts must be handled here.
export const RUN_KEYS: Record<keyof Run, true> = {
  harness: true, id: true, startedAt: true, endedAt: true, durationMs: true, steps: true,
  toolCalls: true, usage: true, verdicts: true, claims: true, recordCount: true, droppedCount: true, team: true,
};
