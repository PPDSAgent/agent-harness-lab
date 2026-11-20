// @vitest-environment node
// FROZEN acceptance tests for HL-013 A1-A2 (pure claims audit). Builder may not edit this file.
// All inline data is SYNTHETIC.
//
// CONTRACT: src/lib/claims-audit.ts exports auditClaims(runs: Run[]) =>
//   { rows: Array<{ runId: string|null, harness: Harness, stepIndex: number, text: string }>,
//     byHarness: Array<{ harness, claims, unsupported, unsupportedRate: number|null }> }
//   rows: one per claim with hasEvidence === false. Order: harness (claude-code, codex, team), then run startedAt
//   ascending (null / unparsable last), then stepIndex ascending.
//   byHarness: one entry per harness present in the input; unsupportedRate = unsupported / claims, null when claims is 0.
import { describe, expect, it } from "vitest";
import type { Claim, Harness, Run } from "../src/lib/ingest";
import { auditClaims } from "../src/lib/claims-audit";

const c = (text: string, hasEvidence: boolean, stepIndex: number): Claim => ({ text, hasEvidence, stepIndex });
function mk(harness: Harness, id: string | null, startedAt: string | null, claims: Claim[]): Run {
  return {
    harness, id, startedAt, endedAt: null, durationMs: null,
    steps: [], toolCalls: [], usage: null, verdicts: [], claims, recordCount: 0, droppedCount: 0,
  };
}
const RUNS: Run[] = [
  mk("codex", "run-03", "2026-05-02T10:00:00Z", [c("codex claim a", false, 4), c("codex claim b", false, 1)]),
  mk("claude-code", "run-02", "2026-05-02T10:00:00Z", [c("cc b1", false, 7), c("cc b2", true, 2)]),
  mk("claude-code", "run-01", "2026-05-01T10:00:00Z", [c("cc a1", false, 9), c("cc a2", true, 1), c("cc a3", true, 2), c("cc a4", true, 3)]),
  mk("team", "run-04", "2026-05-01T10:00:00Z", []),
];
const rowKey = (r: { runId: string | null; stepIndex: number }) => `${r.runId}:${r.stepIndex}`;

describe("HL-013 A1: auditClaims rows", () => {
  it("returns one row per unsupported claim only, carrying run id, harness, step index and text", () => {
    const { rows } = auditClaims(RUNS);
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual({ runId: "run-01", harness: "claude-code", stepIndex: 9, text: "cc a1" });
    expect(rows).toContainEqual({ runId: "run-03", harness: "codex", stepIndex: 1, text: "codex claim b" });
    expect(rows.map((r) => r.text)).not.toContain("cc a2");
    expect(rows.map((r) => r.text)).not.toContain("cc b2");
  });
  it("returns no rows for an empty input and for runs whose claims are all supported", () => {
    expect(auditClaims([]).rows).toEqual([]);
    expect(auditClaims([]).byHarness).toEqual([]);
    expect(auditClaims([mk("codex", "run-05", null, [c("ok", true, 0)])]).rows).toEqual([]);
  });
});

describe("HL-013 A1: auditClaims byHarness", () => {
  const by = (h: Harness) => auditClaims(RUNS).byHarness.find((x) => x.harness === h);
  it("counts claims and unsupported claims per harness and divides them", () => {
    expect(by("claude-code")).toEqual({ harness: "claude-code", claims: 6, unsupported: 2, unsupportedRate: 2 / 6 });
    expect(by("codex")).toEqual({ harness: "codex", claims: 2, unsupported: 2, unsupportedRate: 1 });
  });
  it("a team run with no claims has claims 0, unsupported 0 and a null rate (never 0)", () => {
    expect(by("team")).toEqual({ harness: "team", claims: 0, unsupported: 0, unsupportedRate: null });
  });
  it("a harness whose claims are all supported has a real rate of 0, not null", () => {
    const r = auditClaims([mk("codex", "run-06", null, [c("x", true, 0), c("y", true, 1)])]);
    expect(r.byHarness).toEqual([{ harness: "codex", claims: 2, unsupported: 0, unsupportedRate: 0 }]);
  });
  it("lists only harnesses present in the input, once each", () => {
    const r = auditClaims([mk("codex", "run-07", null, [c("x", false, 0)]), mk("codex", "run-08", null, [])]);
    expect(r.byHarness.map((x) => x.harness)).toEqual(["codex"]);
    expect(r.byHarness[0]).toMatchObject({ claims: 1, unsupported: 1, unsupportedRate: 1 });
  });
});

describe("HL-013 A2: deterministic row order", () => {
  it("orders by harness, then start time, then step index", () => {
    const keys = auditClaims(RUNS).rows.map(rowKey);
    expect(keys).toEqual(["run-01:9", "run-02:7", "run-03:1", "run-03:4"]);
  });
  it("puts null start times last within a harness", () => {
    const runs = [
      mk("codex", "run-n", null, [c("n", false, 0)]),
      mk("codex", "run-late", "2026-06-01T00:00:00Z", [c("l", false, 0)]),
      mk("codex", "run-early", "2026-01-01T00:00:00Z", [c("e", false, 0)]),
    ];
    expect(auditClaims(runs).rows.map((r) => r.runId)).toEqual(["run-early", "run-late", "run-n"]);
  });
  it("orders steps ascending inside one run, regardless of claim order", () => {
    const runs = [mk("claude-code", "run-09", "2026-05-01T00:00:00Z", [c("s5", false, 5), c("s0", false, 0), c("s2", false, 2)])];
    expect(auditClaims(runs).rows.map((r) => r.stepIndex)).toEqual([0, 2, 5]);
  });
  it("the same runs in any input order give identical output, and the input is not mutated", () => {
    const before = JSON.stringify(RUNS);
    const a = auditClaims(RUNS);
    const b = auditClaims([...RUNS].reverse());
    expect(JSON.stringify(b.rows)).toBe(JSON.stringify(a.rows));
    expect(JSON.stringify(auditClaims(RUNS))).toBe(JSON.stringify(a));
    expect(JSON.stringify(RUNS)).toBe(before);
  });
});
