// FROZEN acceptance tests for HL-011b Accept 1 and 3 (skill name on ToolCall; per-skill rows over fixtures).
// Builder may not edit this file. All inline data is SYNTHETIC.
//
// CONTRACT: ToolCall gains `skill: string | null` (src/lib/ingest/types.ts), read through the public
// ingest API (parseClaudeCode / parseCodex / parseRunRecords). A Claude Code `tool_use` block with
// name "Skill" and input.skill a non-empty string carries that string; every other tool call has null.
// Skill-block shape is an ASSUMPTION documented in fixtures/claude-code/README.md.
// summarizeBySkill is in src/lib/usage-summary.ts (see hl-011b.usage-summary.test.ts).
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseClaudeCode, parseCodex, parseRunRecords } from "../src/lib/ingest";
import type { Run, ToolCall } from "../src/lib/ingest";
import * as usage from "../src/lib/usage-summary";

// Called lazily so a missing export fails only the Accept 3 tests, not the parser tests.
const summarizeBySkill = (runs: Run[]) => (usage as unknown as { summarizeBySkill: (r: Run[]) => any[] }).summarizeBySkill(runs);

const ROOT = resolve(__dirname, "..");
const sk = (c: ToolCall) => (c as ToolCall & { skill?: unknown }).skill;

const line = (o: unknown) => JSON.stringify(o);
const header = line({ type: "header", note: "SYNTHETIC", sessionId: "s-1" });
function asst(ts: string, blocks: unknown[]) {
  return line({ type: "assistant", sessionId: "s-1", timestamp: ts, message: { role: "assistant", content: blocks, usage: { input_tokens: 1, output_tokens: 1 } } });
}
const session = [
  header,
  asst("2026-09-18T18:00:00.000Z", [
    { type: "tool_use", id: "t1", name: "Skill", input: { skill: "debugging" } },
    { type: "tool_use", id: "t2", name: "Read", input: { path: "/Users/demo/a.txt" } },
    { type: "tool_use", id: "t3", name: "Read", input: { skill: "not-a-skill" } },
    { type: "tool_use", id: "t4", name: "Skill", input: {} },
    { type: "tool_use", id: "t5", name: "Skill" },
    { type: "tool_use", id: "t6", name: "Skill", input: { skill: "tdd" } },
  ]),
].join("\n");

describe("HL-011b Accept 1: Claude Code parser carries the skill name", () => {
  const run = parseClaudeCode(session);
  const byId = (id: string) => run.toolCalls.find((c) => c.id === id)!;
  it("a Skill tool_use carries input.skill", () => {
    expect(sk(byId("t1"))).toBe("debugging");
    expect(sk(byId("t6"))).toBe("tdd");
  });
  it("a non-Skill tool call has skill null, even if its input has a skill key", () => {
    expect(sk(byId("t2"))).toBeNull();
    expect(sk(byId("t3"))).toBeNull();
  });
  it("a Skill call with no usable input.skill has skill null, not undefined", () => {
    expect(sk(byId("t4"))).toBeNull();
    expect(sk(byId("t5"))).toBeNull();
  });
  it("step-level tool calls expose the same skill values", () => {
    const stepCalls = run.steps.flatMap((s) => s.toolCalls);
    expect(stepCalls.map(sk)).toEqual(run.toolCalls.map(sk));
  });
});

describe("HL-011b Accept 1: over the committed fixtures", () => {
  const dir = join(ROOT, "fixtures", "claude-code");
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  const texts = files.map((f) => readFileSync(join(dir, f), "utf8"));
  const runs = texts.map((t) => parseClaudeCode(t));

  it("every Skill call has a non-empty string skill and every other call has null", () => {
    let skillCalls = 0;
    for (const r of runs) {
      for (const c of r.toolCalls) {
        if (c.name === "Skill") {
          skillCalls++;
          expect(typeof sk(c), `skill of ${c.id}`).toBe("string");
          expect((sk(c) as string).length).toBeGreaterThan(0);
        } else {
          expect(sk(c), `skill of non-Skill call ${c.name}`).toBeNull();
        }
      }
    }
    expect(skillCalls).toBeGreaterThan(0);
  });
  it("skill values match the input.skill in the raw JSONL, call by call", () => {
    const expected: (string | null)[] = [];
    const actual: unknown[] = [];
    texts.forEach((t, i) => {
      for (const l of t.split("\n")) {
        if (!l.trim()) continue;
        const o = JSON.parse(l);
        const blocks = Array.isArray(o?.message?.content) ? o.message.content : [];
        for (const b of blocks) if (b?.type === "tool_use") expected.push(b.name === "Skill" ? b.input.skill : null);
      }
      actual.push(...runs[i]!.toolCalls.map(sk));
    });
    expect(actual).toEqual(expected);
  });
  it("Codex fixture tool calls all have skill null", () => {
    const cdir = join(ROOT, "fixtures", "codex");
    const cruns = readdirSync(cdir).filter((f) => f.endsWith(".jsonl")).map((f) => parseCodex(readFileSync(join(cdir, f), "utf8")));
    const calls = cruns.flatMap((r) => r.toolCalls);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(sk(c)).toBeNull();
  });
  it("team run-record tool calls (if any) all have skill null", () => {
    const rdir = join(ROOT, "runs");
    const recs = readdirSync(rdir).filter((f) => f.endsWith(".json")).map((f) => readFileSync(join(rdir, f), "utf8"));
    for (const r of parseRunRecords(recs)) for (const c of r.toolCalls) expect(sk(c)).toBeNull();
  });
});

describe("HL-011b Accept 3: per-skill rows over the committed fixtures", () => {
  const dir = join(ROOT, "fixtures", "claude-code");
  const cdir = join(ROOT, "fixtures", "codex");
  const claude = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => parseClaudeCode(readFileSync(join(dir, f), "utf8")));
  const codex = readdirSync(cdir).filter((f) => f.endsWith(".jsonl")).map((f) => parseCodex(readFileSync(join(cdir, f), "utf8")));
  const all: Run[] = [...claude, ...codex];
  // Independent oracle: distinct skill names read straight from the raw JSONL.
  const names = new Set<string>();
  const perSkillRuns = new Map<string, number>();
  readdirSync(dir).filter((f) => f.endsWith(".jsonl")).forEach((f) => {
    const seen = new Set<string>();
    for (const l of readFileSync(join(dir, f), "utf8").split("\n")) {
      if (!l.trim()) continue;
      const o = JSON.parse(l);
      const blocks = Array.isArray(o?.message?.content) ? o.message.content : [];
      for (const b of blocks) if (b?.type === "tool_use" && b.name === "Skill") seen.add(b.input.skill);
    }
    for (const s of seen) { names.add(s); perSkillRuns.set(s, (perSkillRuns.get(s) ?? 0) + 1); }
  });
  const rows = (): any[] => summarizeBySkill(all);

  it("the four skills named in the task are present in the fixtures", () => {
    for (const s of ["debugging", "plan-writing", "tdd", "code-review"]) expect(names.has(s), s).toBe(true);
  });
  it("rows are exactly the skills present in the fixtures, sorted by name", () => {
    expect(rows().map((r) => r.skill)).toEqual([...names].sort());
    for (const s of ["debugging", "plan-writing", "tdd", "code-review"]) expect(rows().map((r) => r.skill)).toContain(s);
  });
  it("each row's run count is the number of fixture runs invoking that skill", () => {
    for (const r of rows()) expect(r.runs, r.skill).toBe(perSkillRuns.get(r.skill));
  });
  it("latency n + missing equals runs for every row", () => {
    for (const r of rows()) expect(r.latencyMs.n + r.latencyMs.missing, r.skill).toBe(r.runs);
  });
});
