// @vitest-environment jsdom
// FROZEN fix-1 tests for HL-016 (reviewer findings F1, F2, F3, F4). Builder may not edit this file. SYNTHETIC data.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import P1Questions from "../src/components/p1-questions";
import type { Claim, Harness, Run, ToolCall } from "../src/lib/ingest";

vi.setConfig({ testTimeout: 20000 });
afterEach(cleanup);

const call = (skill: string, isError: boolean | null): ToolCall => ({ id: null, name: "Skill", startedAt: null, endedAt: null, durationMs: null, isError, skill });
const claim = (hasEvidence: boolean, i: number): Claim => ({ text: `c${i}`, hasEvidence, stepIndex: i });
function mk(harness: Harness, id: string, o: { calls?: ToolCall[]; claims?: Claim[]; cost?: number | null } = {}): Run {
  return {
    harness, id, startedAt: null, endedAt: null, durationMs: null, steps: [], toolCalls: o.calls ?? [], usage: null,
    verdicts: [], claims: o.claims ?? [], recordCount: 0, droppedCount: 0,
    team: harness === "team" ? { taskId: null, mode: null, prNumber: null, freezeSha: null, costUsd: o.cost ?? null, branch: null, base: null, phase: null } : undefined,
  };
}
// Same shape as the HL-016 component test's RUNS: Q1 4 invocations of 2 skills in 1 run; Q2 3 team runs; Q3 6 claims.
const RUNS: Run[] = [
  mk("claude-code", "run-01", { calls: [call("skill-a", true), call("skill-a", true), call("skill-a", false), call("skill-b", true)], claims: [claim(true, 0), claim(false, 1), claim(false, 2)] }),
  mk("codex", "run-02", { claims: [claim(true, 0), claim(true, 1), claim(false, 2)] }),
  mk("team", "run-03", { cost: 0.5 }),
  mk("team", "run-04", { cost: 1.5 }),
  mk("team", "run-05", { cost: null }),
];
const region = (name: RegExp) => screen.getByRole("region", { name });
const Q1 = /which skill fails most/i;
const Q2 = /what does each scheduled run cost/i;
const Q3 = /which claims lack evidence/i;
const text = (e: Element) => (e.textContent ?? "").replace(/\s+/g, " ");

describe("HL-016 fix1 F1: each count is printed once", () => {
  it("the Source lines read n = 4 skill invocations, n = 3 scheduled runs, n = 6 claims", () => {
    render(<P1Questions runs={RUNS} />);
    expect(text(region(Q1))).toContain("n = 4 skill invocations");
    expect(text(region(Q2))).toContain("n = 3 scheduled runs");
    expect(text(region(Q3))).toContain("n = 6 claims");
  });
  it("no region repeats a count after n =", () => {
    render(<P1Questions runs={RUNS} />);
    for (const q of [Q1, Q2, Q3]) expect(text(region(q))).not.toMatch(/n = (\d+) \1\b/);
  });
});

describe("HL-016 fix1 F2: unknown outcomes are named", () => {
  it("a top skill with 1 failure and 2 unknown outcomes says 2 are unknown", () => {
    render(<P1Questions runs={[mk("claude-code", "run-01", { calls: [call("beta", true), call("beta", null), call("beta", null)] })]} />);
    const t = text(region(Q1));
    expect(t).toContain("beta");
    expect(t).toMatch(/2 (outcomes? )?unknown|unknown[^.]{0,30}\b2\b/i);
  });
  it("does not claim the unqualified 1 of 3 invocations failed", () => {
    render(<P1Questions runs={[mk("claude-code", "run-01", { calls: [call("beta", true), call("beta", null), call("beta", null)] })]} />);
    expect(text(region(Q1))).not.toMatch(/\b1 of 3 invocations failed/i);
  });
});

describe("HL-016 fix1 F3: Q1 says what its numbers count", () => {
  it("the top line is per skill (N of its M invocations)", () => {
    render(<P1Questions runs={RUNS} />);
    expect(text(region(Q1))).toMatch(/\b2 of its 3 invocations\b/);
  });
  it("the Source line names the skill count and the run count", () => {
    render(<P1Questions runs={RUNS} />);
    const t = text(region(Q1));
    expect(t).toMatch(/\b2 skills\b/);
    expect(t).toMatch(/\b1 run\b/);
  });
});

describe("HL-016 fix1 F4: Q2 leads with the fact when no cost is recorded", () => {
  it("two team runs with unknown cost: first sentence says cost was not recorded for any of the 2 runs", () => {
    render(<P1Questions runs={[mk("team", "t-3"), mk("team", "t-4")]} />);
    const t = text(region(Q2));
    const body = t.replace(/^What does each scheduled run cost\?\s*/i, "");
    const first = body.split(/(?<=\.)\s/)[0]!;
    expect(first).toMatch(/cost (was )?not recorded for any of (the )?2 scheduled runs/i);
    expect(t).not.toMatch(/mean cost per run unknown/i);
  });
});
