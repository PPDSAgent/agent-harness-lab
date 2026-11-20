// FROZEN acceptance tests for HL-011a (summarizeByHarness). Builder may not edit this file.
// All inline data is SYNTHETIC.
//
// CONTRACT: src/lib/usage-summary.ts
//   export function summarizeByHarness(runs: Run[]): HarnessSummary[]
//   HarnessSummary = { harness, runs, latencyMs: Metric, tokens: Metric, costUsd: Metric }
//   Metric = { p50, p95, p99: number | null; n: number; missing: number }
// Percentiles are HL-005 nearest-rank: value at 1-based rank ceil(q/100 * n) of the sorted values.
import { describe, expect, it } from "vitest";
import type { Run, TeamMeta } from "../src/lib/ingest";
import { percentile } from "../src/lib/ingest";
import { summarizeByHarness } from "../src/lib/usage-summary";

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

// claude-code, 5 runs. durationMs sorted [100,200,300,400,500], n=5:
//   p50 rank ceil(2.5)=3 -> 300; p95 rank ceil(4.75)=5 -> 500; p99 rank ceil(4.95)=5 -> 500.
// totalTokens: 1000, 2000, 3000, usage null, usage.totalTokens null -> values [1000,2000,3000], n=3, missing=2:
//   p50 rank ceil(1.5)=2 -> 2000; p95 rank ceil(2.85)=3 -> 3000; p99 -> 3000.
// cost: no run has team meta -> n=0, missing=5, percentiles null.
const cc: Run[] = [
  mk({ id: "cc-3", durationMs: 300, usage: tok(3000) }),
  mk({ id: "cc-1", durationMs: 100, usage: tok(1000) }),
  mk({ id: "cc-5", durationMs: 500, usage: null }),
  mk({ id: "cc-2", durationMs: 200, usage: tok(2000) }),
  mk({ id: "cc-4", durationMs: 400, usage: tok(null) }),
];
// codex, 4 runs. durationMs [10,20,30,40]: p50 rank 2 -> 20; p95 rank ceil(3.8)=4 -> 40; p99 -> 40.
// totalTokens [5,15,25,35]: p50 -> 15; p95 -> 35; p99 -> 35. cost: none (n=0, missing=4).
const cx: Run[] = [
  mk({ harness: "codex", id: "cx-a", durationMs: 40, usage: tok(35) }),
  mk({ harness: "codex", id: "cx-b", durationMs: 10, usage: tok(5) }),
  mk({ harness: "codex", id: "cx-c", durationMs: 30, usage: tok(25) }),
  mk({ harness: "codex", id: "cx-d", durationMs: 20, usage: tok(15) }),
];
// team, 3 runs. durationMs [60000, null, 120000] -> values [60000,120000], n=2, missing=1:
//   p50 rank 1 -> 60000; p95 rank ceil(1.9)=2 -> 120000; p99 -> 120000.
// totalTokens [7000, null, null] -> n=1, missing=2, p50=p95=p99=7000.
// costUsd [0.5, 0.25, (team: null)] -> values [0.25,0.5], n=2, missing=1:
//   p50 rank 1 -> 0.25; p95 rank 2 -> 0.5; p99 -> 0.5.
const tm: Run[] = [
  mk({ harness: "team", id: "tm-a", durationMs: 120000, usage: tok(7000), team: meta(0.5) }),
  mk({ harness: "team", id: "tm-b", durationMs: null, usage: null, team: meta(0.25) }),
  mk({ harness: "team", id: "tm-c", durationMs: 60000, usage: null, team: null }),
];

const byName = (rows: ReturnType<typeof summarizeByHarness>, h: string) => rows.find((r) => r.harness === h);

describe("HL-011a Accept 1: one row per harness with runs, fixed order", () => {
  it("returns claude-code, codex, team in that order whatever the input order", () => {
    const rows = summarizeByHarness([...tm, ...cx, ...cc]);
    expect(rows.map((r) => r.harness)).toEqual(["claude-code", "codex", "team"]);
    expect(rows.map((r) => r.runs)).toEqual([5, 4, 3]);
  });
  it("omits a harness with no runs", () => {
    expect(summarizeByHarness([...cx, ...cc]).map((r) => r.harness)).toEqual(["claude-code", "codex"]);
    expect(summarizeByHarness(tm).map((r) => r.harness)).toEqual(["team"]);
  });
  it("empty input gives an empty array", () => {
    expect(summarizeByHarness([])).toEqual([]);
  });
});

describe("HL-011a Accept 1: metrics match hand-computed nearest-rank values", () => {
  const rows = summarizeByHarness([...tm, ...cx, ...cc]);
  it("claude-code latency from Run.durationMs", () => {
    expect(byName(rows, "claude-code")!.latencyMs).toEqual({ p50: 300, p95: 500, p99: 500, n: 5, missing: 0 });
  });
  it("claude-code tokens from Run.usage?.totalTokens, excluding null usage and null totals", () => {
    expect(byName(rows, "claude-code")!.tokens).toEqual({ p50: 2000, p95: 3000, p99: 3000, n: 3, missing: 2 });
  });
  it("codex latency and tokens", () => {
    const r = byName(rows, "codex")!;
    expect(r.latencyMs).toEqual({ p50: 20, p95: 40, p99: 40, n: 4, missing: 0 });
    expect(r.tokens).toEqual({ p50: 15, p95: 35, p99: 35, n: 4, missing: 0 });
  });
  it("team latency, tokens and cost (Run.team?.costUsd; team: null counts as missing)", () => {
    const r = byName(rows, "team")!;
    expect(r.latencyMs).toEqual({ p50: 60000, p95: 120000, p99: 120000, n: 2, missing: 1 });
    expect(r.tokens).toEqual({ p50: 7000, p95: 7000, p99: 7000, n: 1, missing: 2 });
    expect(r.costUsd).toEqual({ p50: 0.25, p95: 0.5, p99: 0.5, n: 2, missing: 1 });
  });
  it("agrees with the HL-005 percentile helper on the same values", () => {
    const r = byName(rows, "claude-code")!.latencyMs;
    const values = cc.map((x) => x.durationMs as number);
    expect([r.p50, r.p95, r.p99]).toEqual([percentile(values, 50), percentile(values, 95), percentile(values, 99)]);
  });
});

describe("HL-011a Accept 1: missing values and purity", () => {
  const rows = summarizeByHarness([...tm, ...cx, ...cc]);
  it("a metric with no values has null percentiles (never 0), n=0 and missing=runs", () => {
    expect(byName(rows, "claude-code")!.costUsd).toEqual({ p50: null, p95: null, p99: null, n: 0, missing: 5 });
    expect(byName(rows, "codex")!.costUsd).toEqual({ p50: null, p95: null, p99: null, n: 0, missing: 4 });
  });
  it("n + missing === runs for every metric of every row", () => {
    for (const r of rows) for (const m of [r.latencyMs, r.tokens, r.costUsd]) expect(m.n + m.missing).toBe(r.runs);
  });
  it("a zero value is data, not missing", () => {
    const rows0 = summarizeByHarness([mk({ durationMs: 0 }), mk({ durationMs: 10 })]);
    expect(rows0[0]!.latencyMs).toEqual({ p50: 0, p95: 10, p99: 10, n: 2, missing: 0 });
  });
  it("does not mutate the input array or its runs", () => {
    const input = Object.freeze([...tm, ...cx, ...cc].map((r) => Object.freeze(r))) as unknown as Run[];
    const before = JSON.stringify(input);
    summarizeByHarness(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(input.map((r) => r.id)).toEqual([...tm, ...cx, ...cc].map((r) => r.id));
  });
});
