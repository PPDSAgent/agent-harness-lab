// @vitest-environment jsdom
// FROZEN acceptance tests for HL-016 A5-A8 (the three questions on the home screen). Builder may not edit this file.
// All inline data is SYNTHETIC. Ids and names avoid the words null/undefined/NaN on purpose.
//
//  A5 The Home page shows, with no click needed, an h2 matching /three questions/i near the top (before the
//     "Cost, tokens and latency" button), and three regions named /which skill fails most/i,
//     /what does each scheduled run cost/i and /which claims lack evidence/i. Each answer is text.
//  A6 Q1 text names the top skill(s) with failures, invocations and the rate as a percent; ties name all; Q2 text states
//     the run count, the mean cost in dollars and how many runs are unknown; all-unknown costs show "unknown"/"—" and no
//     "$0"; Q3 text states the unsupported count and the claim total.
//  A7 Provenance next to each answer: inside each region, text matching /source/i that contains the source labels
//     (fixtures/claude-code, runs/ ...) and the n counted. Rendered literally (no markup interpretation).
//  A8 A question with no data renders a "not answerable from these sources" message (/not answerable/i), no fabricated
//     number: no NaN/null/undefined, no "0%" or "$0".
//
// CONTRACT: src/components/p1-questions.tsx, default export ({ runs }: { runs: Run[] }) => JSX. May be static or lazy in App.
//   Root: an h2 /three questions/i then three <section aria-labelledby/aria-label> regions as above.
//   Each region has a <figcaption> or <footer> or <p> carrying "Source: ..." with the labels from src/lib/p1-questions.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import App from "../src/App";
import P1Questions from "../src/components/p1-questions";
import { loadTeamRuns } from "../src/lib/load-fixture-runs";
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
const XSS = "<img src=x onerror=alert(1)>";
// Q1: skill-a 3 calls 2 failed (67%), skill-b 1 call 1 failed. Q2: 3 team runs, costs 0.5, 1.5, unknown -> mean $1.00, 1 unknown.
// Q3: 6 claims, 3 unsupported.
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

describe("HL-016 A5: structure", () => {
  it("has an h2 and three named regions with text answers", () => {
    render(<P1Questions runs={RUNS} />);
    expect(screen.getByRole("heading", { level: 2, name: /three questions/i })).toBeTruthy();
    for (const q of [Q1, Q2, Q3]) expect(text(region(q)).length).toBeGreaterThan(20);
  });
});

describe("HL-016 A6: the answers", () => {
  it("Q1 names the top skill with failures of invocations and the percent", () => {
    render(<P1Questions runs={RUNS} />);
    const t = text(region(Q1));
    expect(t).toContain("skill-a");
    expect(t).toMatch(/\b2\b[^0-9]{1,30}\b3\b/);
    expect(t).toMatch(/66\.7\s*%|67\s*%/);
  });
  it("Q1 names every skill tied for most failures", () => {
    render(<P1Questions runs={[mk("claude-code", "t-1", { calls: [call("zed", true), call("amy", true), call("mid", false)] })]} />);
    const t = text(region(Q1));
    expect(t).toContain("zed");
    expect(t).toContain("amy");
  });
  it("Q1 with invocations but no failures says so and names no failing skill", () => {
    render(<P1Questions runs={[mk("claude-code", "t-2", { calls: [call("quiet", false)] })]} />);
    expect(text(region(Q1))).toMatch(/no (skill )?(invocations? )?(failed|failures?)|none failed|did not fail/i);
  });
  it("Q2 states the run count, the mean in dollars and the unknown count", () => {
    render(<P1Questions runs={RUNS} />);
    const t = text(region(Q2));
    expect(t).toMatch(/\b3\b/);
    expect(t).toMatch(/\$\s?1(\.00?)?(?![0-9])/);
    expect(t).toMatch(/\b1\b[^.]{0,40}unknown|unknown[^.]{0,40}\b1\b/i);
  });
  it("Q2 with every cost unknown shows unknown, not $0", () => {
    render(<P1Questions runs={[mk("team", "t-3"), mk("team", "t-4")]} />);
    const t = text(region(Q2));
    expect(t).toMatch(/unknown|—/i);
    expect(t).not.toMatch(/\$\s?0(\.0+)?(?![0-9.])/);
    expect(t).not.toMatch(/\bNaN\b|\bnull\b|\bundefined\b/);
    expect(t).toMatch(/\b2\b/);
  });
  it("Q3 states the unsupported count and the claim total", () => {
    render(<P1Questions runs={RUNS} />);
    const t = text(region(Q3));
    expect(t).toMatch(/\b3\b/);
    expect(t).toMatch(/\b6\b/);
  });
});

describe("HL-016 A7: provenance beside each answer", () => {
  it("every region has a Source line naming the source set and n", () => {
    render(<P1Questions runs={RUNS} />);
    const q1 = text(region(Q1));
    expect(q1).toMatch(/source/i);
    expect(q1).toContain("fixtures/claude-code");
    expect(q1).toMatch(/\b4\b/); // 4 skill invocations
    const q2 = text(region(Q2));
    expect(q2).toMatch(/source/i);
    expect(q2).toContain("runs/");
    const q3 = text(region(Q3));
    expect(q3).toMatch(/source/i);
    expect(q3).toContain("fixtures/claude-code");
    expect(q3).toContain("fixtures/codex");
  });
  it("renders a skill name containing markup as text and creates no img", () => {
    const { container } = render(<P1Questions runs={[mk("claude-code", "x-1", { calls: [call(XSS, true)] })]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(within(region(Q1)).getByText(XSS, { exact: false })).toBeTruthy();
  });
});

describe("HL-016 A8: no data is stated, not faked", () => {
  it("with no runs, each question says it is not answerable from these sources", () => {
    render(<P1Questions runs={[]} />);
    for (const q of [Q1, Q2, Q3]) {
      const t = text(region(q));
      expect(t).toMatch(/not answerable/i);
      expect(t).not.toMatch(/\bNaN\b|\bnull\b|\bundefined\b/);
      expect(t).not.toMatch(/\b0\s*%|\$\s?0(?![0-9])/);
    }
  });
});

describe("HL-016 A5: Home page", () => {
  it("shows the section without any click, ahead of the usage disclosure", async () => {
    render(<App />);
    const h = await screen.findByRole("heading", { level: 2, name: /three questions/i }, { timeout: 8000 });
    const usage = screen.getByRole("button", { name: "Cost, tokens and latency" });
    expect(h.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING, "heading precedes the usage disclosure").toBeTruthy();
    for (const q of [Q1, Q2, Q3]) expect(await screen.findByRole("region", { name: q }, { timeout: 8000 })).toBeTruthy();
  });
  it("answers Q2 from the real run records: the run count and unknown costs are stated", async () => {
    render(<App />);
    const team = loadTeamRuns();
    const unknown = team.filter((r) => r.team?.costUsd == null).length;
    const t = text(await screen.findByRole("region", { name: Q2 }, { timeout: 8000 }));
    expect(t).toContain(String(team.length));
    expect(t).toContain(String(unknown));
    expect(t).toMatch(/unknown/i);
    expect(t).toContain("runs/");
  });
});
