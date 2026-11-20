// FROZEN acceptance tests for HL-012 Accept 1 (pure verdict summary). Builder may not edit this file.
// All inline data is SYNTHETIC.
//
// CONTRACT: src/lib/verdict-summary.ts
//   summarizeVerdicts(runs): one row per harness present (order claude-code, codex, team) with
//     harness, pass, conditional, fail, noVerdict, passRate (pass / (pass+conditional+fail), null when denominator 0).
//   A run's outcome is its LAST verdict (highest stepIndex; ties -> last in array). No verdicts -> noVerdict.
//   passRateTrend(runs): per harness per UTC day (YYYY-MM-DD) of startedAt, ascending by day:
//     { day, harness, judged, pass, passRate }. startedAt null/unparsable runs are excluded and counted in `excluded`
//     (the result is an array carrying `.excluded`, or an object with an `excluded` number and one array property).
import { describe, expect, it } from "vitest";
import type { Harness, Run, Verdict } from "../src/lib/ingest";
import { passRateTrend, summarizeVerdicts } from "../src/lib/verdict-summary";

const v = (value: Verdict["value"], stepIndex = 0): Verdict => ({ value, stepIndex });
function mk(harness: Harness, startedAt: string | null, verdicts: Verdict[]): Run {
  return {
    harness, id: "r", startedAt, endedAt: null, durationMs: null,
    steps: [], toolCalls: [], usage: null, verdicts, claims: [], recordCount: 0, droppedCount: 0,
  };
}
const row = (rows: any[], h: string) => rows.find((r) => r.harness === h);

describe("HL-012 Accept 1: summarizeVerdicts", () => {
  it("counts the last verdict per run, by harness, in claude-code, codex, team order", () => {
    const runs = [
      mk("team", null, [v("FAIL", 0)]),
      mk("codex", null, [v("PASS", 0)]),
      mk("claude-code", null, [v("FAIL", 0), v("PASS", 3)]), // last by stepIndex = PASS
      mk("claude-code", null, [v("PASS", 5), v("CONDITIONAL", 2)]), // highest stepIndex = PASS (array order irrelevant)
      mk("claude-code", null, [v("PASS", 1), v("FAIL", 1)]), // tie -> last in array = FAIL
      mk("claude-code", null, [v("CONDITIONAL", 0)]),
      mk("claude-code", null, []),
    ];
    const rows = summarizeVerdicts(runs) as any[];
    expect(rows.map((r) => r.harness)).toEqual(["claude-code", "codex", "team"]);
    const c = row(rows, "claude-code");
    expect([c.pass, c.conditional, c.fail, c.noVerdict]).toEqual([2, 1, 1, 1]);
    expect(c.passRate).toBeCloseTo(2 / 4, 10);
    expect(row(rows, "codex").passRate).toBe(1);
    expect(row(rows, "team").passRate).toBe(0); // judged, all failed: 0, not null
  });
  it("only harnesses present in the input get a row", () => {
    const rows = summarizeVerdicts([mk("codex", null, [v("PASS")])]) as any[];
    expect(rows.map((r) => r.harness)).toEqual(["codex"]);
    expect(summarizeVerdicts([])).toEqual([]);
  });
  it("passRate is null (not 0, not NaN) when no run has a verdict; those runs are noVerdict, not fail", () => {
    const rows = summarizeVerdicts([mk("team", null, []), mk("team", null, [])]) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].passRate).toBeNull();
    expect([rows[0].pass, rows[0].conditional, rows[0].fail, rows[0].noVerdict]).toEqual([0, 0, 0, 2]);
  });
});

function trend(runs: Run[]): { rows: any[]; excluded: number } {
  const r: any = passRateTrend(runs);
  if (Array.isArray(r)) return { rows: r, excluded: r.excluded };
  const arr = Object.values(r).find((x) => Array.isArray(x)) as any[];
  return { rows: arr, excluded: r.excluded };
}

describe("HL-012 Accept 1: passRateTrend", () => {
  it("groups by harness and UTC day, ascending, with judged, pass and passRate", () => {
    const runs = [
      mk("claude-code", "2026-02-02T10:00:00Z", [v("PASS")]),
      mk("claude-code", "2026-02-01T23:30:00Z", [v("FAIL")]),
      mk("claude-code", "2026-02-02T23:59:59Z", [v("CONDITIONAL")]),
      mk("claude-code", "2026-02-02T01:00:00Z", []), // no verdict: not judged
      mk("codex", "2026-02-02T00:00:00Z", [v("PASS")]),
      mk("claude-code", "2026-02-03T00:30:00+02:00", [v("PASS")]), // = 2026-02-02T22:30Z, UTC day 02
    ];
    const { rows } = trend(runs);
    const cc = rows.filter((r) => r.harness === "claude-code");
    expect(cc.map((r) => r.day)).toEqual(["2026-02-01", "2026-02-02"]);
    expect(cc[0]).toMatchObject({ judged: 1, pass: 0, passRate: 0 });
    expect(cc[1]).toMatchObject({ judged: 3, pass: 2 });
    expect(cc[1].passRate).toBeCloseTo(2 / 3, 10);
    expect(rows.filter((r) => r.harness === "codex")).toEqual([
      expect.objectContaining({ day: "2026-02-02", judged: 1, pass: 1, passRate: 1 }),
    ]);
    // sorted ascending by day overall
    const days = rows.map((r) => r.day);
    expect([...days].sort()).toEqual(days);
  });
  it("a day with runs but no verdicts has passRate null, not 0 or NaN", () => {
    const { rows } = trend([mk("team", "2026-03-01T12:00:00Z", []), mk("team", "2026-03-02T12:00:00Z", [v("PASS")])]);
    const d1 = rows.find((r) => r.day === "2026-03-01");
    if (d1) {
      expect(d1.judged).toBe(0);
      expect(d1.passRate).toBeNull();
    }
    expect(rows.find((r) => r.day === "2026-03-02")).toMatchObject({ judged: 1, pass: 1, passRate: 1 });
    for (const r of rows) expect(Number.isNaN(r.passRate)).toBe(false);
  });
  it("excludes runs with null or unparsable startedAt and reports how many", () => {
    const { rows, excluded } = trend([
      mk("codex", null, [v("PASS")]),
      mk("codex", "not-a-date", [v("PASS")]),
      mk("codex", "2026-04-01T00:00:00Z", [v("PASS")]),
    ]);
    expect(excluded).toBe(2);
    expect(rows.map((r) => r.day)).toEqual(["2026-04-01"]);
    expect(rows[0].judged).toBe(1);
  });
  it("excluded is 0 when every run is dated", () => {
    expect(trend([mk("codex", "2026-04-01T00:00:00Z", [v("PASS")])]).excluded).toBe(0);
  });
});
