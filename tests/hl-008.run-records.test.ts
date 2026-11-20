// @vitest-environment node
// FROZEN acceptance tests for HL-008 (ingest the team's own run records as a third source).
// Written by the test engineer before the build; the builder may not edit this file.
// Inline data is SYNTHETIC. The committed runs/*.json are the team's own records.
//
// PUBLIC CONTRACT, imported from `src/lib/ingest/index.ts` only:
//
//   parseRunRecord(text: string): Run      // text of ONE runs/*.json file
//   parseRunRecords(texts: readonly string[]): Run[]   // = texts.map(parseRunRecord), same order
//
// `Harness` gains the member "team" (the third source; HL-014 compares it with
// "claude-code" and "codex"). The parser reads the JSON as-is and is LENIENT: it does not
// run the schema validator, never throws, and keeps whatever null/absent values it finds
// (even where the schema would forbid them, e.g. a null check exit).
//
// Mapping (the source is one JSON object, so "records" are its dispatches and checks):
//   run.harness     = "team"
//   run.id          = `${run_date}T${slot}` (equals the file name stem, e.g. "2026-11-05T1839");
//                     null if run_date or slot is not a string
//   run.startedAt   = started_at (string or null)
//   run.endedAt     = finished_at (null stays null; it is never replaced by started_at or "")
//   run.durationMs  = Date.parse(endedAt) - Date.parse(startedAt) when BOTH are known, else null
//   run.steps       = one Step per dispatch, in order:
//                       index = position; timestamp = dispatch.started_at (string|null);
//                       text = `${role}/${duty}` (e.g. "test-engineer/freeze");
//                       usage = null; toolCalls = []; sourceLines = []
//   run.toolCalls   = one ToolCall per check, in order (this flat list is the ONLY place
//                     checks appear; step.toolCalls stays empty):
//                       id = null; name = check.name; startedAt = endedAt = durationMs = null;
//                       isError = null when exit is null/absent, else exit !== 0
//   run.usage       = null when tokens is null/absent, else
//                       { inputTokens: null, outputTokens: null, totalTokens: tokens }
//   run.verdicts    = [] when review is null/absent or review.verdict is not one of
//                     PASS|CONDITIONAL|FAIL; else one Verdict { value: review.verdict, stepIndex }
//                     where stepIndex is the index of the LAST dispatch whose role is
//                     "reviewer", or, when there is none, the last step's index, or 0 with no steps.
//   run.claims      = []
//   run.recordCount = dispatches.length + checks.length
//   run.droppedCount= 0 for a JSON object. Text that is not valid JSON, or not a JSON object, returns a
//                     Run with harness "team", recordCount 1, droppedCount 1, no steps (no throw).
//   run.team        = { taskId, mode, prNumber, freezeSha, costUsd, branch, base, phase }
//                     copied verbatim from task_id, mode, pr_number, freeze_sha, cost_usd, branch,
//                     base, phase; a null or absent source field becomes null (never 0 or "").
//                     `team` is null for the non-lenient failure case above.
//                     (Run gains an optional `team?: TeamMeta | null`; absent on the other harnesses.)
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseClaudeCode, parseRunRecord, parseRunRecords } from "../src/lib/ingest";

const RUNS_DIR = resolve(__dirname, "..", "runs");
const files = readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json")).sort();
const committed = files.map((f) => ({ file: f, text: readFileSync(join(RUNS_DIR, f), "utf8") }));

interface Team {
  taskId: string | null;
  mode: string | null;
  prNumber: number | null;
  freezeSha: string | null;
  costUsd: number | null;
  branch: string | null;
  base: string | null;
  phase: string | null;
}
const teamOf = (run: unknown): Team | null => (run as { team: Team | null }).team;

// SYNTHETIC deliberately incomplete record: died before finishing.
const INCOMPLETE = JSON.stringify({
  schema_version: 2,
  run_date: "2026-01-02",
  slot: "0900",
  started_at: "2026-01-02T17:00:00Z",
  finished_at: null,
  mode: "BUILD",
  task_id: null,
  phase: "0-synthetic",
  branch: "run/2026-01-02-0900-HL-900",
  base: "main",
  pr_number: null,
  freeze_sha: null,
  dispatches: [
    { role: "test-engineer", duty: "freeze", model: "sonnet", outcome: "red", started_at: null, finished_at: null },
    { role: "builder", duty: "build", model: "sonnet", outcome: "died", started_at: "2026-01-02T17:10:00Z", finished_at: null },
  ],
  checks: [
    { name: "npm test", exit: null },
    { name: "npm run build", exit: 0 },
    { name: "npm run lint", exit: 2 },
  ],
  review: null,
  tokens: null,
  cost_usd: null,
  notes: "SYNTHETIC; home path /Users/demo/proj",
});

const COMPLETE = JSON.stringify({
  schema_version: 2,
  run_date: "2026-01-03",
  slot: "1200",
  started_at: "2026-01-03T20:00:00Z",
  finished_at: "2026-01-03T20:30:00Z",
  mode: "FIX",
  task_id: "HL-901",
  phase: "0-synthetic",
  branch: "run/2026-01-03-1200-HL-901",
  base: "main",
  pr_number: 7,
  freeze_sha: "abc1234",
  dispatches: [
    { role: "test-engineer", duty: "freeze", model: "sonnet", outcome: "red", started_at: "2026-01-03T20:01:00Z", finished_at: null },
    { role: "reviewer", duty: "review-r1", model: "opus", outcome: "PASS", started_at: "2026-01-03T20:20:00Z", finished_at: null },
    { role: "builder", duty: "fix", model: "sonnet", outcome: "ok", started_at: "2026-01-03T20:25:00Z", finished_at: null },
  ],
  checks: [{ name: "npm test", exit: 0 }],
  review: { verdict: "PASS", path: "reviews/x.md", fix_pass_used: false },
  tokens: 1234,
  cost_usd: 0.5,
});

describe("HL-008 Accept 1: committed run records parse", () => {
  it("there is at least one committed record to parse", () => {
    expect(committed.length).toBeGreaterThanOrEqual(8);
  });

  it("every committed runs/*.json parses with zero dropped records", () => {
    const runs = parseRunRecords(committed.map((c) => c.text));
    expect(runs).toHaveLength(committed.length);
    runs.forEach((run, i) => {
      const src = JSON.parse(committed[i].text);
      const name = committed[i].file;
      expect(run.harness, name).toBe("team");
      expect(run.droppedCount, name).toBe(0);
      expect(run.recordCount, name).toBe(src.dispatches.length + src.checks.length);
      expect(run.steps, name).toHaveLength(src.dispatches.length);
      expect(run.toolCalls, name).toHaveLength(src.checks.length);
      expect(run.id, name).toBe(name.replace(/\.json$/, ""));
    });
  });

  it("parseRunRecords equals parseRunRecord applied to each text, in order", () => {
    const a = parseRunRecords(committed.map((c) => c.text));
    const b = committed.map((c) => parseRunRecord(c.text));
    expect(a).toEqual(b);
  });

  it("maps task id, mode, start and end times, duration, and step order", () => {
    const run = parseRunRecord(COMPLETE);
    expect(run.id).toBe("2026-01-03T1200");
    expect(run.startedAt).toBe("2026-01-03T20:00:00Z");
    expect(run.endedAt).toBe("2026-01-03T20:30:00Z");
    expect(run.durationMs).toBe(30 * 60 * 1000);
    const t = teamOf(run)!;
    expect(t.taskId).toBe("HL-901");
    expect(t.mode).toBe("FIX");
    expect(t.prNumber).toBe(7);
    expect(t.freezeSha).toBe("abc1234");
    expect(t.costUsd).toBe(0.5);
    expect(t.branch).toBe("run/2026-01-03-1200-HL-901");
    expect(t.base).toBe("main");
    expect(t.phase).toBe("0-synthetic");
    expect(run.steps.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(run.steps.map((s) => s.text)).toEqual(["test-engineer/freeze", "reviewer/review-r1", "builder/fix"]);
    expect(run.steps.map((s) => s.timestamp)).toEqual([
      "2026-01-03T20:01:00Z",
      "2026-01-03T20:20:00Z",
      "2026-01-03T20:25:00Z",
    ]);
    expect(run.steps.every((s) => s.toolCalls.length === 0 && s.usage === null && s.sourceLines.length === 0)).toBe(true);
  });

  it("maps checks to tool calls: name kept, isError = exit !== 0", () => {
    const run = parseRunRecord(COMPLETE);
    expect(run.toolCalls).toEqual([
      { id: null, name: "npm test", startedAt: null, endedAt: null, durationMs: null, isError: false },
    ]);
    const real = committed.map((c) => ({ c, run: parseRunRecord(c.text) }));
    for (const { c, run: r } of real) {
      const src = JSON.parse(c.text) as { checks: { name: string; exit: number }[] };
      expect(r.toolCalls.map((t) => t.name), c.file).toEqual(src.checks.map((k) => k.name));
      expect(r.toolCalls.map((t) => t.isError), c.file).toEqual(src.checks.map((k) => k.exit !== 0));
    }
  });

  it("maps the review verdict into a Verdict pointing at the last reviewer step", () => {
    const run = parseRunRecord(COMPLETE);
    expect(run.verdicts).toEqual([{ value: "PASS", stepIndex: 1 }]);
    for (const c of committed) {
      const src = JSON.parse(c.text) as {
        review: { verdict: string } | null;
        dispatches: { role: string }[];
      };
      const r = parseRunRecord(c.text);
      if (src.review === null) {
        expect(r.verdicts, c.file).toEqual([]);
        continue;
      }
      expect(r.verdicts, c.file).toHaveLength(1);
      expect(r.verdicts[0].value, c.file).toBe(src.review.verdict);
      const lastReviewer = src.dispatches.map((d) => d.role).lastIndexOf("reviewer");
      if (lastReviewer >= 0) expect(r.verdicts[0].stepIndex, c.file).toBe(lastReviewer);
    }
  });

  it("is distinguishable from the other sources and leaves them alone", () => {
    const run = parseRunRecord(COMPLETE);
    expect(run.harness).toBe("team");
    const cc = parseClaudeCode('{"type":"synthetic-header","note":"SYNTHETIC"}\n');
    expect(cc.harness).toBe("claude-code");
    expect(teamOf(cc) ?? null).toBeNull();
  });

  it("invalid JSON or a non-object is counted as dropped, never thrown", () => {
    for (const bad of ["{not json", "[1,2]", "42", ""]) {
      const run = parseRunRecord(bad);
      expect(run.harness).toBe("team");
      expect(run.recordCount).toBe(1);
      expect(run.droppedCount).toBe(1);
      expect(run.steps).toEqual([]);
      expect(run.toolCalls).toEqual([]);
    }
  });
});

describe("HL-008 Accept 2: nulls are preserved", () => {
  it("null source fields map to null, never 0 or an empty string (incomplete synthetic record)", () => {
    const run = parseRunRecord(INCOMPLETE);
    expect(run.droppedCount).toBe(0);
    expect(run.endedAt).toBeNull();
    expect(run.durationMs).toBeNull();
    expect(run.usage).toBeNull();
    expect(run.verdicts).toEqual([]);
    const t = teamOf(run)!;
    expect(t.taskId).toBeNull();
    expect(t.prNumber).toBeNull();
    expect(t.freezeSha).toBeNull();
    expect(t.costUsd).toBeNull();
    expect(run.steps[0].timestamp).toBeNull();
    expect(run.steps[1].timestamp).toBe("2026-01-02T17:10:00Z");
  });

  it("a null check exit gives isError null, not false", () => {
    const run = parseRunRecord(INCOMPLETE);
    expect(run.toolCalls.map((t) => [t.name, t.isError])).toEqual([
      ["npm test", null],
      ["npm run build", false],
      ["npm run lint", true],
    ]);
  });

  it("duration is null unless both ends are known, and tokens only fill totalTokens", () => {
    const noStart = JSON.stringify({ ...JSON.parse(COMPLETE), started_at: null });
    expect(parseRunRecord(noStart).durationMs).toBeNull();
    expect(parseRunRecord(noStart).startedAt).toBeNull();
    expect(parseRunRecord(COMPLETE).usage).toEqual({ inputTokens: null, outputTokens: null, totalTokens: 1234 });
  });

  it("absent fields (not just null ones) also become null", () => {
    const run = parseRunRecord('{"run_date":"2026-01-04","slot":"0100","dispatches":[],"checks":[]}');
    expect(run.droppedCount).toBe(0);
    expect(run.recordCount).toBe(0);
    expect(run.startedAt).toBeNull();
    expect(run.endedAt).toBeNull();
    expect(run.durationMs).toBeNull();
    expect(run.usage).toBeNull();
    expect(run.verdicts).toEqual([]);
    expect(teamOf(run)).toEqual({
      taskId: null, mode: null, prNumber: null, freezeSha: null, costUsd: null, branch: null, base: null, phase: null,
    });
  });

  it("every committed record: each null field in the source is null in the model", () => {
    for (const c of committed) {
      const src = JSON.parse(c.text) as Record<string, unknown> & {
        dispatches: { started_at: string | null }[];
      };
      const run = parseRunRecord(c.text);
      const t = teamOf(run)!;
      expect(run.endedAt, c.file).toBe(src.finished_at);
      expect(t.taskId, c.file).toBe(src.task_id);
      expect(t.prNumber, c.file).toBe(src.pr_number);
      expect(t.freezeSha, c.file).toBe(src.freeze_sha);
      expect(t.costUsd, c.file).toBe(src.cost_usd);
      expect(run.usage === null, c.file).toBe(src.tokens === null);
      expect(run.steps.map((s) => s.timestamp), c.file).toEqual(src.dispatches.map((d) => d.started_at));
      expect(run.durationMs === null, c.file).toBe(src.started_at === null || src.finished_at === null);
    }
    // sensitivity guard: the committed set really contains null values to preserve
    const srcs = committed.map((c) => JSON.parse(c.text) as Record<string, unknown>);
    expect(srcs.some((s) => s.pr_number === null)).toBe(true);
    expect(srcs.some((s) => s.cost_usd === null)).toBe(true);
    expect(srcs.some((s) => s.task_id === null)).toBe(true);
  });
});
