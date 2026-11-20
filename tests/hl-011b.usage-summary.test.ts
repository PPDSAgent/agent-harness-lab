// FROZEN acceptance tests for HL-011b Accept 2 (summarizeBySkill). Builder may not edit this file.
// All inline data is SYNTHETIC.
//
// CONTRACT: src/lib/usage-summary.ts
//   export function summarizeBySkill(runs: Run[]): SkillSummary[]
//   SkillSummary = { skill: string; runs: number; latencyMs: Metric; tokens: Metric; costUsd: Metric }
//   Metric as in HL-011a. One row per distinct skill, sorted by skill name (plain code-unit order).
//   A run counts once per distinct skill it invoked (via toolCalls[].skill). Runs with no skill are in no row.
// Percentiles are HL-005 nearest-rank: value at 1-based rank ceil(q/100 * n) of the sorted values.
import { describe, expect, it } from "vitest";
import type { Run, TeamMeta, ToolCall } from "../src/lib/ingest";
import { summarizeBySkill } from "../src/lib/usage-summary";

const call = (skill: string | null, name: string | null = skill === null ? "Read" : "Skill"): ToolCall =>
  ({ id: null, name, startedAt: null, endedAt: null, durationMs: null, isError: null, skill }) as ToolCall;
function mk(over: Partial<Run>): Run {
  return {
    harness: "claude-code", id: "id", startedAt: null, endedAt: null, durationMs: null,
    steps: [], toolCalls: [], usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0, ...over,
  };
}
const tok = (totalTokens: number | null) => ({ inputTokens: null, outputTokens: null, totalTokens });
const meta = (costUsd: number | null): TeamMeta => ({
  taskId: null, mode: null, prNumber: null, freezeSha: null, costUsd, branch: null, base: null, phase: null,
});

// Runs (all SYNTHETIC). tools = skills invoked, in order, duplicates allowed.
//  r1: tdd                      dur 100  tok 1000  cost -
//  r2: tdd, debugging           dur 200  tok 2000  cost -
//  r3: debugging, debugging     dur 300  tok null  cost -   (same skill twice -> counts once)
//  r4: tdd                      dur null tok 4000  cost -
//  r5: (no skill; Read only)    dur 999  tok 999
//  r7: codex, tdd               dur 400  tok 500   cost -   (skill is harness-independent)
//  r8: code-review (team-meta cost) dur 50 tok 10 cost 0.5
//  r9: code-review              dur 70  tok 30  cost 0.25
//  r10: code-review             dur 60  tok 20  cost null team meta
const runs: Run[] = [
  mk({ id: "r1", durationMs: 100, usage: tok(1000), toolCalls: [call("tdd")] }),
  mk({ id: "r2", durationMs: 200, usage: tok(2000), toolCalls: [call("tdd"), call(null), call("debugging")] }),
  mk({ id: "r3", durationMs: 300, usage: tok(null), toolCalls: [call("debugging"), call("debugging")] }),
  mk({ id: "r4", durationMs: null, usage: tok(4000), toolCalls: [call("tdd")] }),
  mk({ id: "r5", durationMs: 999, usage: tok(999), toolCalls: [call(null)] }),
  mk({ id: "r7", harness: "codex", durationMs: 400, usage: tok(500), toolCalls: [call("tdd")] }),
  mk({ id: "r8", harness: "team", durationMs: 50, usage: tok(10), team: meta(0.5), toolCalls: [call("code-review")] }),
  mk({ id: "r9", harness: "team", durationMs: 70, usage: tok(30), team: meta(0.25), toolCalls: [call("code-review")] }),
  mk({ id: "r10", harness: "team", durationMs: 60, usage: tok(20), team: meta(null), toolCalls: [call("code-review")] }),
];
const by = (rows: ReturnType<typeof summarizeBySkill>, s: string) => rows.find((r) => r.skill === s);

describe("HL-011b Accept 2: one row per distinct skill, sorted by name", () => {
  const rows = summarizeBySkill(runs);
  it("returns code-review, debugging, tdd in that order whatever the input order", () => {
    expect(rows.map((r) => r.skill)).toEqual(["code-review", "debugging", "tdd"]);
    expect(summarizeBySkill([...runs].reverse()).map((r) => r.skill)).toEqual(["code-review", "debugging", "tdd"]);
  });
  it("sorts by plain name order, not by run count", () => {
    const rs = [
      mk({ id: "a", toolCalls: [call("zeta")] }), mk({ id: "b", toolCalls: [call("zeta")] }),
      mk({ id: "c", toolCalls: [call("alpha")] }),
    ];
    expect(summarizeBySkill(rs).map((r) => r.skill)).toEqual(["alpha", "zeta"]);
  });
  it("empty input and runs with no skill give an empty array", () => {
    expect(summarizeBySkill([])).toEqual([]);
    expect(summarizeBySkill([mk({ toolCalls: [call(null)] }), mk({ toolCalls: [] })])).toEqual([]);
  });
});

describe("HL-011b Accept 2: runs counts each run once per skill", () => {
  const rows = summarizeBySkill(runs);
  it("a run that invoked two skills counts once in each", () => {
    expect(by(rows, "tdd")!.runs).toBe(4); // r1, r2, r4, r7
    expect(by(rows, "debugging")!.runs).toBe(2); // r2, r3
  });
  it("the same skill invoked twice in one run counts once", () => {
    // r3 invokes debugging twice; if double-counted, runs would be 3 and latency n would be 3.
    expect(by(rows, "debugging")!.runs).toBe(2);
    expect(by(rows, "debugging")!.latencyMs.n).toBe(2);
  });
  it("runs with no skill are in no row", () => {
    expect(by(rows, "code-review")!.runs).toBe(3);
    const total = rows.reduce((a, r) => a + r.runs, 0);
    expect(total).toBe(4 + 2 + 3);
  });
});

describe("HL-011b Accept 2: metrics are hand-computed nearest-rank over the runs that invoked the skill", () => {
  const rows = summarizeBySkill(runs);
  // tdd latency: r1 100, r2 200, r4 null, r7 400 -> [100,200,400], n=3, missing=1:
  //   p50 rank ceil(1.5)=2 -> 200; p95 rank ceil(2.85)=3 -> 400; p99 -> 400.
  it("tdd latency from Run.durationMs, null excluded and counted", () => {
    expect(by(rows, "tdd")!.latencyMs).toEqual({ p50: 200, p95: 400, p99: 400, n: 3, missing: 1 });
  });
  // tdd tokens: 1000, 2000, 4000, 500 -> [500,1000,2000,4000], n=4: p50 rank 2 -> 1000; p95 rank ceil(3.8)=4 -> 4000; p99 -> 4000.
  it("tdd tokens from Run.usage.totalTokens", () => {
    expect(by(rows, "tdd")!.tokens).toEqual({ p50: 1000, p95: 4000, p99: 4000, n: 4, missing: 0 });
  });
  // tdd cost: no run has team meta -> n=0, missing=4, percentiles null (never 0).
  it("a metric with no values has null percentiles, never 0", () => {
    expect(by(rows, "tdd")!.costUsd).toEqual({ p50: null, p95: null, p99: null, n: 0, missing: 4 });
  });
  // debugging latency: r2 200, r3 300 -> p50 rank 1 -> 200; p95 rank ceil(1.9)=2 -> 300; p99 -> 300.
  // debugging tokens: r2 2000, r3 null -> n=1, missing=1, all 2000.
  it("debugging latency and tokens", () => {
    expect(by(rows, "debugging")!.latencyMs).toEqual({ p50: 200, p95: 300, p99: 300, n: 2, missing: 0 });
    expect(by(rows, "debugging")!.tokens).toEqual({ p50: 2000, p95: 2000, p99: 2000, n: 1, missing: 1 });
  });
  // code-review latency [50,60,70]: p50 rank ceil(1.5)=2 -> 60; p95 rank 3 -> 70; p99 -> 70.
  // tokens [10,20,30]: p50 20; p95 30; p99 30.
  // cost: r8 0.5, r9 0.25, r10 team meta null -> [0.25,0.5], n=2, missing=1: p50 rank 1 -> 0.25; p95 rank 2 -> 0.5; p99 -> 0.5.
  it("code-review latency, tokens and cost from team.costUsd", () => {
    const r = by(rows, "code-review")!;
    expect(r.latencyMs).toEqual({ p50: 60, p95: 70, p99: 70, n: 3, missing: 0 });
    expect(r.tokens).toEqual({ p50: 20, p95: 30, p99: 30, n: 3, missing: 0 });
    expect(r.costUsd).toEqual({ p50: 0.25, p95: 0.5, p99: 0.5, n: 2, missing: 1 });
  });
  it("a run with usage null counts as missing tokens, not as 0", () => {
    const only = summarizeBySkill([mk({ durationMs: 5, usage: null, toolCalls: [call("solo")] })]);
    expect(only[0]!.tokens).toEqual({ p50: null, p95: null, p99: null, n: 0, missing: 1 });
    expect(only[0]!.latencyMs).toEqual({ p50: 5, p95: 5, p99: 5, n: 1, missing: 0 });
  });
});

describe("HL-011b Accept 2: purity", () => {
  it("does not mutate its input", () => {
    const input = [...runs];
    const snapshot = JSON.stringify(runs);
    summarizeBySkill(input);
    expect(JSON.stringify(runs)).toBe(snapshot);
    expect(input.map((r) => r.id)).toEqual(runs.map((r) => r.id));
  });
  it("returns equal results when called twice", () => {
    expect(summarizeBySkill(runs)).toEqual(summarizeBySkill(runs));
  });
});
