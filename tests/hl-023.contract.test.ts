// @vitest-environment node
// FROZEN acceptance tests for HL-023 (P1 contract: all three fixture sources validate against the run model).
// Written by the test engineer before the build; the builder may not edit this file.
// Inline data is SYNTHETIC. The fixture sets are the HL-003/HL-004 outputs and the team's runs/*.json (schema v2).
//
// INTERFACE REQUIRED FROM THE BUILDER (does not exist yet; that is why these tests are red):
//   File:   src/lib/ingest/contract.ts
//   Export: validateRun(value: unknown, expectedHarness?: "claude-code" | "codex" | "team"):
//             { valid: boolean; errors: string[] }
//   It never throws (any JS value, including null, arrays, cyclic-free junk), never mutates its input,
//   and `errors` is [] when valid and non-empty when invalid. It validates the normalized Run of
//   src/lib/ingest/types.ts (HL-005, extended by HL-008/HL-011b), STRICTLY: "null, never absent".
//     Run:      harness in {claude-code, codex, team} (and === expectedHarness when given);
//               id, startedAt, endedAt: string | null; durationMs: finite number | null;
//               steps: Step[]; toolCalls: ToolCall[]; usage: Usage | null; verdicts: Verdict[];
//               claims: Claim[]; recordCount, droppedCount: non-negative integers, droppedCount <= recordCount;
//               team: absent or null for claude-code/codex; for "team" the key must be present
//               (null, or a TeamMeta). `undefined` is never accepted where null is allowed.
//     Step:     index integer; timestamp, text: string | null; usage: Usage | null; toolCalls: ToolCall[];
//               sourceLines: integer[].
//     ToolCall: id, name, startedAt, endedAt: string | null; durationMs: finite number | null;
//               isError: boolean | null; skill: string | null, undefined allowed (optional field).
//     Usage:    inputTokens, outputTokens, totalTokens: finite number | null.
//     Verdict:  value in {PASS, CONDITIONAL, FAIL}; stepIndex integer.
//     Claim:    text string; hasEvidence boolean; stepIndex integer.
//     TeamMeta: taskId, mode, freezeSha, branch, base, phase: string | null; prNumber, costUsd: finite number | null.
// The parsers are NOT changed by this task's contract: they must already produce Runs that pass it.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseClaudeCode, parseCodex, parseRunRecord } from "../src/lib/ingest";
import { validateRun } from "../src/lib/ingest/contract";
import { validateRunRecord } from "../src/lib/validate-run-record";

const ROOT = resolve(__dirname, "..");
const load = (dir: string, ext: string) =>
  readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(ext)).sort()
    .map((f) => ({ file: f, text: readFileSync(join(ROOT, dir, f), "utf8") }));
const claude = load("fixtures/claude-code", ".jsonl");
const codex = load("fixtures/codex", ".jsonl");
const team = load("runs", ".json");

type Src = "claude-code" | "codex" | "team";
const sources: { name: Src; files: { file: string; text: string }[]; parse: (t: string) => unknown }[] = [
  { name: "claude-code", files: claude, parse: parseClaudeCode },
  { name: "codex", files: codex, parse: parseCodex },
  { name: "team", files: team, parse: parseRunRecord },
];

const clone = <T>(v: T): T => structuredClone(v);
type Obj = Record<string, any>;

describe("HL-023 accept 1: every record of every source validates against the run model", () => {
  it("each of the three fixture sets is non-empty", () => {
    expect(claude.length).toBeGreaterThan(0);
    expect(codex.length).toBeGreaterThan(0);
    expect(team.length).toBeGreaterThan(0);
  });
  for (const s of sources) {
    it(`${s.name}: every file parses to a Run that validates, tagged "${s.name}"`, () => {
      for (const { file, text } of s.files) {
        const run = s.parse(text) as Obj;
        const r = validateRun(run, s.name);
        expect(r.errors, file).toEqual([]);
        expect(r.valid, file).toBe(true);
        expect(run.harness, file).toBe(s.name);
      }
    });
  }
  it("a valid run is also valid without naming the expected source", () => {
    expect(validateRun(parseClaudeCode(claude[0].text)).valid).toBe(true);
    expect(validateRun(parseCodex(codex[0].text)).valid).toBe(true);
    expect(validateRun(parseRunRecord(team[0].text)).valid).toBe(true);
  });
});

describe("HL-023 accept 2: no record is dropped", () => {
  for (const s of [sources[0], sources[1]]) {
    it(`${s.name}: droppedCount is 0 and each record line is in exactly one step`, () => {
      for (const { file, text } of s.files) {
        const run = s.parse(text) as Obj;
        const lines: number[] = run.steps.flatMap((st: Obj) => st.sourceLines);
        expect(run.droppedCount, file).toBe(0);
        expect(new Set(lines).size, `${file} duplicate line`).toBe(lines.length);
        expect(lines.length, file).toBe(run.recordCount);
      }
    });
  }
  it("team: droppedCount is 0 and recordCount = dispatches + checks", () => {
    for (const { file, text } of team) {
      const run = parseRunRecord(text);
      const rec = JSON.parse(text);
      expect(run.droppedCount, file).toBe(0);
      expect(run.recordCount, file).toBe((rec.dispatches?.length ?? 0) + (rec.checks?.length ?? 0));
    }
  });
  it("a corrupt input line stays visible: counted in droppedCount, and the Run still validates", () => {
    const lines = claude[0].text.split("\n");
    lines.splice(2, 0, "{not json");
    const run = parseClaudeCode(lines.join("\n"));
    expect(run.droppedCount).toBeGreaterThanOrEqual(1);
    expect(validateRun(run, "claude-code").valid).toBe(true);
    const cx = codex[0].text.split("\n");
    cx.splice(2, 0, "{not json");
    const crun = parseCodex(cx.join("\n"));
    expect(crun.droppedCount).toBeGreaterThanOrEqual(1);
    expect(validateRun(crun, "codex").valid).toBe(true);
    const bad = parseRunRecord("{not json");
    expect(bad.droppedCount).toBe(1);
    expect(validateRun(bad, "team").valid).toBe(true);
  });
});

describe("HL-023 accept 3: the runs/ source also satisfies the run-record schema (HL-002)", () => {
  it("every committed runs/*.json validates against the schema and its parsed id is the file stem", () => {
    for (const { file, text } of team) {
      expect(validateRunRecord(JSON.parse(text)).errors, file).toEqual([]);
      expect(parseRunRecord(text).id, file).toBe(file.replace(/\.json$/, ""));
    }
  });
});

// Each mutation takes a valid Run (object) and breaks one rule of the contract.
const mutations: [string, (r: Obj) => void][] = [
  ["harness tag missing", (r) => delete r.harness],
  ["harness tag unknown", (r) => (r.harness = "gemini")],
  ["id absent instead of null", (r) => delete r.id],
  ["id is a number", (r) => (r.id = 7)],
  ["startedAt undefined", (r) => (r.startedAt = undefined)],
  ["durationMs is NaN", (r) => (r.durationMs = Number.NaN)],
  ["durationMs is a string", (r) => (r.durationMs = "5")],
  ["steps is not an array", (r) => (r.steps = {})],
  ["toolCalls missing", (r) => delete r.toolCalls],
  ["usage is a string", (r) => (r.usage = "x")],
  ["verdicts missing", (r) => delete r.verdicts],
  ["claims is null", (r) => (r.claims = null)],
  ["recordCount negative", (r) => (r.recordCount = -1)],
  ["recordCount fractional", (r) => (r.recordCount = 1.5)],
  ["droppedCount missing", (r) => delete r.droppedCount],
  ["droppedCount exceeds recordCount", (r) => ((r.recordCount = 1), (r.droppedCount = 2))],
  ["extra verdict value", (r) => r.verdicts.push({ value: "MAYBE", stepIndex: 0 })],
  ["claim without hasEvidence boolean", (r) => r.claims.push({ text: "x", hasEvidence: "yes", stepIndex: 0 })],
  ["usage field undefined", (r) => (r.usage = { inputTokens: 1, outputTokens: undefined, totalTokens: 1 })],
  ["usage field is 0-string", (r) => (r.usage = { inputTokens: "0", outputTokens: 0, totalTokens: 0 })],
  ["step sourceLines not integers", (r) => r.steps.push({ index: 0, timestamp: null, text: null, usage: null, toolCalls: [], sourceLines: ["1"] })],
  ["step index missing", (r) => r.steps.push({ timestamp: null, text: null, usage: null, toolCalls: [], sourceLines: [] })],
  ["step text undefined", (r) => r.steps.push({ index: 0, timestamp: null, text: undefined, usage: null, toolCalls: [], sourceLines: [] })],
  ["toolCall isError is a string", (r) => r.toolCalls.push({ id: null, name: "x", startedAt: null, endedAt: null, durationMs: null, isError: "no" })],
  ["toolCall name missing", (r) => r.toolCalls.push({ id: null, startedAt: null, endedAt: null, durationMs: null, isError: null })],
  ["toolCall skill is a number", (r) => r.toolCalls.push({ id: null, name: null, startedAt: null, endedAt: null, durationMs: null, isError: null, skill: 3 })],
];

describe("HL-023 accept 4: a deliberately malformed record from each source is rejected", () => {
  const baseline = (n: Src) => {
    const s = sources.find((x) => x.name === n)!;
    return s.parse(s.files[0].text) as Obj;
  };
  for (const n of ["claude-code", "codex", "team"] as Src[]) {
    describe(n, () => {
      it("the unmodified baseline is valid (so each rejection below is caused by the mutation)", () => {
        expect(validateRun(baseline(n), n).errors).toEqual([]);
      });
      for (const [label, mutate] of mutations) {
        it(`rejects: ${label}`, () => {
          const run = clone(baseline(n));
          mutate(run);
          const r = validateRun(run, n);
          expect(r.valid).toBe(false);
          expect(r.errors.length).toBeGreaterThan(0);
        });
      }
      it("rejects a Run tagged as a different source than expected", () => {
        const other: Src = n === "codex" ? "claude-code" : "codex";
        const r = validateRun(baseline(n), other);
        expect(r.valid).toBe(false);
        expect(r.errors.length).toBeGreaterThan(0);
      });
    });
  }
  it("team: the key `team` must be present (null or TeamMeta), and TeamMeta fields are typed", () => {
    const run = clone(baseline("team"));
    expect(run.team).not.toBeUndefined();
    delete run.team;
    expect(validateRun(run, "team").valid).toBe(false);
    const r2 = clone(baseline("team"));
    r2.team = { ...r2.team, prNumber: "12" };
    expect(validateRun(r2, "team").valid).toBe(false);
    const r3 = clone(baseline("team"));
    delete r3.team.branch;
    expect(validateRun(r3, "team").valid).toBe(false);
  });
  it("claude-code and codex Runs must not carry a team object", () => {
    for (const n of ["claude-code", "codex"] as Src[]) {
      const run = clone(baseline(n));
      run.team = { taskId: null, mode: null, prNumber: null, freezeSha: null, costUsd: null, branch: null, base: null, phase: null };
      expect(validateRun(run, n).valid, n).toBe(false);
    }
  });
  it("never throws and rejects non-Run values", () => {
    for (const v of [null, undefined, 0, "run", [], {}, () => 1, { harness: "team" }]) {
      const r = validateRun(v);
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
  it("does not mutate its input", () => {
    const run = baseline("claude-code");
    const before = JSON.stringify(run);
    validateRun(run, "claude-code");
    expect(JSON.stringify(run)).toBe(before);
  });
});
