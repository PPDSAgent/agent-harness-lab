// @vitest-environment node
// FROZEN acceptance tests for HL-005 (normalized run model and ingest library).
// Written by the test engineer before the build; the builder may not edit this file.
// All inline data below is SYNTHETIC; the fixture sets are the HL-003 and HL-004 outputs.
//
// PUBLIC CONTRACT: everything is imported from `src/lib/ingest/index.ts` (a directory
// module `src/lib/ingest/` with an index.ts). Nothing else is imported, so internals are free.
//
//   parseClaudeCode(text: string): Run   // one Claude Code transcript JSONL file's text
//   parseCodex(text: string): Run        // one Codex rollout JSONL file's text
//   percentile(values: readonly number[], q: number): number | null   // q in (0, 100]
//   p50(values), p95(values), p99(values): number | null              // = percentile(values, 50|95|99)
//
//   Line accounting. Physical lines are numbered from 1 by splitting the text on "\n".
//   Line 1 is the header (Claude Code: `synthetic-header`; Codex: `session_meta`) and is
//   not a record. Every other NON-BLANK line is a record. Blank lines are not records.
//     run.recordCount   = number of records.
//     run.droppedCount  = number of records not mapped to any step (a line that is not valid
//                         JSON is dropped and counted here; it is never skipped silently and
//                         the parser does not throw on it).
//     step.sourceLines  = the 1-based physical line numbers the step was built from. A step may
//                         merge several lines; each record's line appears in exactly one step.
//   "Zero dropped" means: droppedCount === 0, and the union of all steps' sourceLines equals
//   the set of record line numbers, with no line listed twice.
//
//   Run {
//     harness: "claude-code" | "codex"
//     id: string | null            // Claude Code: sessionId of the events; Codex: session_meta payload.id
//     startedAt: string | null     // earliest record timestamp (ISO string as in the source)
//     endedAt: string | null       // latest record timestamp
//     durationMs: number | null    // endedAt - startedAt; null when fewer than 2 records carry a timestamp
//     steps: Step[]                // in file order
//     toolCalls: ToolCall[]        // every tool call of the run, in file order (flat view)
//     usage: Usage | null          // per-field sum over steps; a field is null when no step has it;
//                                  // the whole object is null when no step has a usage
//     verdicts: Verdict[]
//     claims: Claim[]
//     recordCount: number
//     droppedCount: number
//   }
//   Step {
//     index: number                // 0-based position in run.steps
//     timestamp: string | null     // source timestamp of the step's first line, null when absent
//     text: string | null          // assistant text of the step, null when it has none
//     usage: Usage | null          // null when the source step has no usage
//     toolCalls: ToolCall[]        // tool calls issued in this step
//     sourceLines: number[]
//   }
//   ToolCall {
//     id: string | null            // Claude Code: tool_use id; Codex: call_id
//     name: string | null
//     startedAt: string | null     // timestamp of the call record
//     endedAt: string | null       // timestamp of the matching result record; null when no result exists
//     durationMs: number | null    // endedAt - startedAt; null when either is null
//     isError: boolean | null      // true when the result marks failure; null when there is no result
//   }
//   Usage { inputTokens, outputTokens, totalTokens: number | null (each field independently) }
//     Claude Code: message.usage.input_tokens / output_tokens; the source has no total, so
//       totalTokens is null (never input+output, never 0).
//     Codex: each `token_count` event is a step whose usage is `info.last_token_usage`
//       (input_tokens, output_tokens, total_tokens).
//   Verdict { value: "PASS" | "CONDITIONAL" | "FAIL"; stepIndex: number }
//   Claim   { text: string; hasEvidence: boolean; stepIndex: number }
//     One verdict per assistant text matching /REVIEW-VERDICT: (PASS|CONDITIONAL|FAIL)/.
//     One claim per assistant text containing "CLAIM:"; hasEvidence = text also contains "EVIDENCE:".
//     Claude Code assistant texts are `text` blocks of assistant events. Codex assistant texts
//     are `event_msg` `agent_message` payload.message only (the `response_item` message that
//     repeats the same words is the same turn and is not counted again).
//   Tool errors: Claude Code: tool_result block with is_error === true. Codex: the
//     function_call_output.output string starts with "error:" (the HL-004 fixture convention).
//   Tool matching: Claude Code: tool_result.tool_use_id === tool_use.id. Codex: call_id.
//
//   Percentile definition: NEAREST-RANK. For n values sorted ascending, percentile(q) is the
//   value at 1-based rank ceil(q/100 * n). Empty input returns null. Input is not mutated and
//   need not be sorted. (Linear interpolation would give p50 of [1,2,3,4] = 2.5; nearest-rank gives 2.)
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  p50,
  p95,
  p99,
  parseClaudeCode,
  parseCodex,
  percentile,
  type Run,
} from "../src/lib/ingest";

const ROOT = resolve(__dirname, "..");
const CC_DIR = join(ROOT, "fixtures", "claude-code");
const CX_DIR = join(ROOT, "fixtures", "codex");

type Obj = Record<string, any>;
interface Raw {
  file: string;
  text: string;
  // physical 1-based line number -> parsed object, for non-blank lines after the header
  records: { line: number; obj: Obj }[];
}
function loadSet(dir: string, pattern: RegExp): Raw[] {
  return readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort()
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      const records: Raw["records"] = [];
      text.split("\n").forEach((l, i) => {
        if (i === 0 || l.trim() === "") return;
        records.push({ line: i + 1, obj: JSON.parse(l) as Obj });
      });
      return { file, text, records };
    });
}
const ccSet = loadSet(CC_DIR, /\.jsonl$/);
const cxSet = loadSet(CX_DIR, /^rollout-.*\.jsonl$/);

function ccBlocks(o: Obj): Obj[] {
  const c = o?.message?.content;
  return Array.isArray(c) ? c.filter((b) => b && typeof b === "object") : [];
}
function ccAssistantTexts(raw: Raw): string[] {
  return raw.records
    .filter((r) => r.obj.type === "assistant")
    .flatMap((r) => ccBlocks(r.obj))
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string);
}
function cxAgentTexts(raw: Raw): string[] {
  return raw.records
    .filter((r) => r.obj.type === "event_msg" && r.obj.payload?.type === "agent_message")
    .map((r) => r.obj.payload.message as string);
}

function accounted(run: Run, raw: Raw): void {
  const lines = run.steps.flatMap((s) => s.sourceLines);
  expect(new Set(lines).size, `${raw.file}: a line is listed in two steps`).toBe(lines.length);
  expect([...lines].sort((a, b) => a - b), raw.file).toEqual(raw.records.map((r) => r.line));
  expect(run.recordCount, raw.file).toBe(raw.records.length);
  expect(run.droppedCount, raw.file).toBe(0);
}

// ---------------------------------------------------------------------------------------
describe("HL-005 accept 1: both fixture sets parse with zero dropped records", () => {
  it("the fixture sets are the expected size (60 Claude Code, 30 Codex)", () => {
    expect(ccSet).toHaveLength(60);
    expect(cxSet).toHaveLength(30);
  });

  it("Claude Code: every file maps every record to exactly one step, droppedCount 0", () => {
    for (const raw of ccSet) {
      const run = parseClaudeCode(raw.text);
      expect(run.harness).toBe("claude-code");
      accounted(run, raw);
    }
    const total = ccSet.reduce((n, r) => n + r.records.length, 0);
    expect(total).toBe(713 - 60); // 713 lines incl. 60 headers (counted from the fixture set)
  });

  it("Codex: every file maps every record to exactly one step, droppedCount 0", () => {
    for (const raw of cxSet) {
      const run = parseCodex(raw.text);
      expect(run.harness).toBe("codex");
      accounted(run, raw);
    }
    const total = cxSet.reduce((n, r) => n + r.records.length, 0);
    expect(total).toBe(932 - 30); // 932 lines incl. 30 headers
  });

  it("the accounting check can fail: a malformed line is counted as dropped, not skipped silently", () => {
    const base = ccSet[0].text.trimEnd().split("\n");
    base.splice(2, 0, "{ this is not json");
    const run = parseClaudeCode(base.join("\n") + "\n");
    expect(run.recordCount).toBe(ccSet[0].records.length + 1);
    expect(run.droppedCount).toBe(1);
    expect(run.steps.flatMap((s) => s.sourceLines)).not.toContain(3);
  });

  it("run ids come from the source: sessionId (Claude Code), session_meta payload.id (Codex)", () => {
    for (const raw of ccSet) expect(parseClaudeCode(raw.text).id).toBe(raw.records[0].obj.sessionId);
    for (const raw of cxSet) {
      const header = JSON.parse(raw.text.split("\n")[0]) as Obj;
      expect(parseCodex(raw.text).id).toBe(header.payload.id);
    }
  });

  it("tool calls, errors, verdicts and claims in the model match the raw counts", () => {
    for (const raw of ccSet) {
      const run = parseClaudeCode(raw.text);
      const uses = raw.records.flatMap((r) => ccBlocks(r.obj)).filter((b) => b.type === "tool_use");
      const errs = raw.records
        .flatMap((r) => ccBlocks(r.obj))
        .filter((b) => b.type === "tool_result" && b.is_error === true);
      const texts = ccAssistantTexts(raw);
      expect(run.toolCalls.length, raw.file).toBe(uses.length);
      expect(run.toolCalls.filter((t) => t.isError === true).length, raw.file).toBe(errs.length);
      expect(run.verdicts.length, raw.file).toBe(texts.filter((t) => /REVIEW-VERDICT: (PASS|CONDITIONAL|FAIL)/.test(t)).length);
      expect(run.claims.length, raw.file).toBe(texts.filter((t) => t.includes("CLAIM:")).length);
      expect(run.claims.filter((c) => c.hasEvidence).length, raw.file).toBe(
        texts.filter((t) => t.includes("CLAIM:") && t.includes("EVIDENCE:")).length,
      );
    }
    for (const raw of cxSet) {
      const run = parseCodex(raw.text);
      const calls = raw.records.filter((r) => r.obj.payload?.type === "function_call");
      const errs = raw.records.filter(
        (r) => r.obj.payload?.type === "function_call_output" && String(r.obj.payload.output).startsWith("error:"),
      );
      const texts = cxAgentTexts(raw);
      expect(run.toolCalls.length, raw.file).toBe(calls.length);
      expect(run.toolCalls.filter((t) => t.isError === true).length, raw.file).toBe(errs.length);
      expect(run.verdicts.length, raw.file).toBe(texts.filter((t) => /REVIEW-VERDICT: (PASS|CONDITIONAL|FAIL)/.test(t)).length);
      expect(run.claims.length, raw.file).toBe(texts.filter((t) => t.includes("CLAIM:")).length);
    }
  });

  it("verdict values are parsed (all three appear across the Codex set)", () => {
    const seen = new Set(cxSet.flatMap((r) => parseCodex(r.text).verdicts.map((v) => v.value)));
    expect([...seen].sort()).toEqual(["CONDITIONAL", "FAIL", "PASS"]);
  });

  it("usage totals match the raw sums for both sets", () => {
    for (const raw of ccSet) {
      const u = raw.records.map((r) => r.obj.message?.usage).filter(Boolean) as Obj[];
      const run = parseClaudeCode(raw.text);
      if (u.length === 0) {
        expect(run.usage, raw.file).toBeNull();
      } else {
        expect(run.usage?.inputTokens, raw.file).toBe(u.reduce((n, x) => n + x.input_tokens, 0));
        expect(run.usage?.outputTokens, raw.file).toBe(u.reduce((n, x) => n + x.output_tokens, 0));
      }
      expect(run.usage === null || run.usage.totalTokens === null, raw.file).toBe(true);
    }
    for (const raw of cxSet) {
      const u = raw.records
        .filter((r) => r.obj.payload?.type === "token_count")
        .map((r) => r.obj.payload.info.last_token_usage as Obj);
      const run = parseCodex(raw.text);
      expect(run.usage?.inputTokens, raw.file).toBe(u.reduce((n, x) => n + x.input_tokens, 0));
      expect(run.usage?.outputTokens, raw.file).toBe(u.reduce((n, x) => n + x.output_tokens, 0));
      expect(run.usage?.totalTokens, raw.file).toBe(u.reduce((n, x) => n + x.total_tokens, 0));
    }
  });
});

// ---------------------------------------------------------------------------------------
// Inline SYNTHETIC sessions for absent-field cases.
const CC_HEADER = '{"type":"synthetic-header","note":"SYNTHETIC inline test session"}';
const ccEv = (o: Obj) => JSON.stringify({ sessionId: "s-1", ...o });
const CX_HEADER = JSON.stringify({
  ordinal: 0,
  type: "session_meta",
  timestamp: "2026-10-01T00:00:00.000Z",
  payload: { id: "sess-x", synthetic: "SYNTHETIC inline test session" },
});

function eachUsageNumber(u: unknown): number[] {
  return u && typeof u === "object" ? Object.values(u as Obj).filter((v) => typeof v === "number") : [];
}

describe("HL-005 accept 2: missing fields map to null, never 0 (Claude Code)", () => {
  const text =
    [
      CC_HEADER,
      ccEv({ type: "user", timestamp: "2026-09-01T10:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "go" }] } }),
      // assistant with NO usage and a tool call that never gets a result
      ccEv({
        type: "assistant",
        timestamp: "2026-09-01T10:00:10.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "working" }, { type: "tool_use", id: "t1", name: "Bash", input: {} }] },
      }),
      // assistant with usage that lacks output_tokens, and no timestamp at all
      ccEv({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "more" }], usage: { input_tokens: 7 } },
      }),
    ].join("\n") + "\n";
  const run = parseClaudeCode(text);

  it("an assistant event with no usage has step.usage === null", () => {
    expect(run.steps.find((s) => s.text === "working")?.usage).toBeNull();
  });
  it("a usage object lacking output_tokens gives outputTokens null and inputTokens 7", () => {
    const u = run.steps.find((s) => s.text === "more")?.usage;
    expect(u?.inputTokens).toBe(7);
    expect(u?.outputTokens).toBeNull();
    expect(u?.totalTokens).toBeNull();
  });
  it("run.usage sums only present values: input 7, output null", () => {
    expect(run.usage?.inputTokens).toBe(7);
    expect(run.usage?.outputTokens).toBeNull();
  });
  it("an event with no timestamp has step.timestamp === null", () => {
    expect(run.steps.find((s) => s.text === "more")?.timestamp).toBeNull();
  });
  it("a tool call with no result has endedAt, durationMs and isError null", () => {
    expect(run.toolCalls).toHaveLength(1);
    const t = run.toolCalls[0];
    expect(t.id).toBe("t1");
    expect(t.name).toBe("Bash");
    expect(t.endedAt).toBeNull();
    expect(t.durationMs).toBeNull();
    expect(t.isError).toBeNull();
  });
  it("no Usage field in the whole run is 0 when the source lacked it", () => {
    const nums = [run.usage, ...run.steps.map((s) => s.usage)].flatMap(eachUsageNumber);
    expect(nums.filter((n) => n === 0)).toEqual([]);
  });
  it("a session with no usage anywhere has run.usage === null", () => {
    const r = parseClaudeCode(
      [CC_HEADER, ccEv({ type: "user", timestamp: "2026-09-01T10:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "hi" }] } })].join("\n") + "\n",
    );
    expect(r.usage).toBeNull();
    expect(r.steps.every((s) => s.usage === null)).toBe(true);
  });
  it("durationMs is null with fewer than 2 timestamps, not 0", () => {
    const r = parseClaudeCode(
      [CC_HEADER, ccEv({ type: "user", timestamp: "2026-09-01T10:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "hi" }] } })].join("\n") + "\n",
    );
    expect(r.startedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(r.durationMs).toBeNull();
  });
});

describe("HL-005 accept 2: missing fields map to null, never 0 (Codex)", () => {
  const noTokens =
    [
      CX_HEADER,
      JSON.stringify({ ordinal: 1, type: "event_msg", timestamp: "2026-10-01T00:00:05.000Z", payload: { type: "user_message", message: "go" } }),
      JSON.stringify({
        ordinal: 2,
        type: "response_item",
        timestamp: "2026-10-01T00:00:10.000Z",
        payload: { type: "function_call", name: "shell", call_id: "call_a", arguments: "{}" },
      }),
    ].join("\n") + "\n";

  it("a Codex session with no token_count has run.usage === null and every step.usage null", () => {
    const run = parseCodex(noTokens);
    expect(run.usage).toBeNull();
    expect(run.steps.length).toBeGreaterThan(0);
    expect(run.steps.every((s) => s.usage === null)).toBe(true);
  });
  it("a function_call with no output has endedAt, durationMs and isError null", () => {
    const run = parseCodex(noTokens);
    expect(run.toolCalls).toHaveLength(1);
    const t = run.toolCalls[0];
    expect(t.id).toBe("call_a");
    expect(t.name).toBe("shell");
    expect(t.endedAt).toBeNull();
    expect(t.durationMs).toBeNull();
    expect(t.isError).toBeNull();
  });
  it("a token_count whose info lacks reasoning/total fields gives null for the missing ones, not 0", () => {
    const run = parseCodex(
      [
        CX_HEADER,
        JSON.stringify({
          ordinal: 1,
          type: "event_msg",
          timestamp: "2026-10-01T00:00:05.000Z",
          payload: { type: "token_count", info: { last_token_usage: { input_tokens: 11 } } },
        }),
      ].join("\n") + "\n",
    );
    const u = run.steps[0].usage;
    expect(u?.inputTokens).toBe(11);
    expect(u?.outputTokens).toBeNull();
    expect(u?.totalTokens).toBeNull();
  });
  it("a token_count with info null has step.usage === null", () => {
    const run = parseCodex(
      [
        CX_HEADER,
        JSON.stringify({ ordinal: 1, type: "event_msg", timestamp: "2026-10-01T00:00:05.000Z", payload: { type: "token_count", info: null } }),
      ].join("\n") + "\n",
    );
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0].usage).toBeNull();
    expect(run.usage).toBeNull();
  });
});

describe("HL-005: tool-call durations come from timestamps", () => {
  it("Claude Code: durationMs = result timestamp - call timestamp (hand-computed 2500 ms)", () => {
    const run = parseClaudeCode(
      [
        CC_HEADER,
        ccEv({
          type: "assistant",
          timestamp: "2026-09-01T10:00:00.000Z",
          message: { role: "assistant", content: [{ type: "tool_use", id: "t9", name: "Read", input: {} }] },
        }),
        ccEv({
          type: "user",
          timestamp: "2026-09-01T10:00:02.500Z",
          message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t9", content: "ok" }] },
        }),
      ].join("\n") + "\n",
    );
    expect(run.toolCalls[0].durationMs).toBe(2500);
    expect(run.toolCalls[0].endedAt).toBe("2026-09-01T10:00:02.500Z");
    expect(run.durationMs).toBe(2500);
  });
  it("Codex: durationMs = output timestamp - call timestamp, matched by call_id; error: output sets isError", () => {
    const run = parseCodex(
      [
        CX_HEADER,
        JSON.stringify({ ordinal: 1, type: "response_item", timestamp: "2026-10-01T00:00:10.000Z", payload: { type: "function_call", name: "shell", call_id: "c1", arguments: "{}" } }),
        JSON.stringify({ ordinal: 2, type: "response_item", timestamp: "2026-10-01T00:00:11.000Z", payload: { type: "function_call", name: "shell", call_id: "c2", arguments: "{}" } }),
        JSON.stringify({ ordinal: 3, type: "response_item", timestamp: "2026-10-01T00:00:14.000Z", payload: { type: "function_call_output", call_id: "c2", output: "error: boom" } }),
        JSON.stringify({ ordinal: 4, type: "response_item", timestamp: "2026-10-01T00:00:15.000Z", payload: { type: "function_call_output", call_id: "c1", output: "ok" } }),
      ].join("\n") + "\n",
    );
    const byId = Object.fromEntries(run.toolCalls.map((t) => [t.id, t]));
    expect(byId.c1.durationMs).toBe(5000);
    expect(byId.c1.isError).toBe(false);
    expect(byId.c2.durationMs).toBe(3000);
    expect(byId.c2.isError).toBe(true);
  });
  it("tool-call durations feed the percentile helpers (hand-computed p50 = 2000)", () => {
    const mk = (id: string, start: string, end: string) => [
      ccEv({ type: "assistant", timestamp: start, message: { role: "assistant", content: [{ type: "tool_use", id, name: "Bash", input: {} }] } }),
      ccEv({ type: "user", timestamp: end, message: { role: "user", content: [{ type: "tool_result", tool_use_id: id }] } }),
    ];
    const run = parseClaudeCode(
      [
        CC_HEADER,
        ...mk("a", "2026-09-01T10:00:00.000Z", "2026-09-01T10:00:01.000Z"),
        ...mk("b", "2026-09-01T10:01:00.000Z", "2026-09-01T10:01:02.000Z"),
        ...mk("c", "2026-09-01T10:02:00.000Z", "2026-09-01T10:02:04.000Z"),
      ].join("\n") + "\n",
    );
    const d = run.toolCalls.map((t) => t.durationMs as number);
    expect(d).toEqual([1000, 2000, 4000]);
    expect(p50(d)).toBe(2000);
    expect(p95(d)).toBe(4000);
  });
});

// ---------------------------------------------------------------------------------------
describe("HL-005 accept 3: p50, p95, p99 helpers match hand-computed values (nearest-rank)", () => {
  const oneTo100 = Array.from({ length: 100 }, (_, i) => i + 1);
  const tens = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it("1..100: p50 = 50, p95 = 95, p99 = 99 (rank = q for n = 100)", () => {
    expect(p50(oneTo100)).toBe(50);
    expect(p95(oneTo100)).toBe(95);
    expect(p99(oneTo100)).toBe(99);
  });
  it("10..100 step 10 (n = 10): p50 = 50 (rank 5), p95 = 100 (rank ceil(9.5) = 10), p99 = 100", () => {
    expect(p50(tens)).toBe(50);
    expect(p95(tens)).toBe(100);
    expect(p99(tens)).toBe(100);
  });
  it("definition check: [1,2,3,4] p50 is 2 (nearest-rank), not 2.5 (linear interpolation)", () => {
    expect(p50([1, 2, 3, 4])).toBe(2);
  });
  it("definition check: [15,20,35,40,50] p95 is 50 and p50 is 35 (rank ceil(2.5) = 3)", () => {
    expect(p95([15, 20, 35, 40, 50])).toBe(50);
    expect(p50([15, 20, 35, 40, 50])).toBe(35);
  });
  it("a single value is every percentile", () => {
    expect([p50([7]), p95([7]), p99([7])]).toEqual([7, 7, 7]);
  });
  it("unsorted input gives the same answer and is not mutated", () => {
    const input = [40, 10, 30, 20];
    const copy = [...input];
    expect(p50(input)).toBe(20); // sorted [10,20,30,40], rank 2
    expect(p95(input)).toBe(40);
    expect(input).toEqual(copy);
  });
  it("percentile(values, q) is the general form and agrees with the named helpers", () => {
    expect(percentile(oneTo100, 50)).toBe(p50(oneTo100));
    expect(percentile(oneTo100, 95)).toBe(p95(oneTo100));
    expect(percentile(oneTo100, 99)).toBe(p99(oneTo100));
    expect(percentile([1, 2, 3, 4], 25)).toBe(1); // rank ceil(1.0) = 1
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
  });
  it("empty input returns null for every helper, not 0", () => {
    expect(p50([])).toBeNull();
    expect(p95([])).toBeNull();
    expect(p99([])).toBeNull();
    expect(percentile([], 50)).toBeNull();
  });
});
