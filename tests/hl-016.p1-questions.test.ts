// @vitest-environment node
// FROZEN acceptance tests for HL-016 A1-A4 (pure answers to the three P1 questions). Builder may not edit this file.
// All inline data is SYNTHETIC.
//
// Acceptance criteria (derived from PLAN.md Project 1 "the three questions" and BACKLOG HL-016):
//  A1 Q1 "which skill fails most often": per skill, invocations (tool calls whose `skill` is a non-empty string),
//     failures (isError === true) and failureRate; the answer is the skill(s) with the most failures. Ties are all
//     returned (name order), never one picked silently. Calls with unknown outcome (isError null) are not failures.
//     No skill invocations -> status "no-data"; invocations but zero failures -> status "no-failures" (top empty).
//  A2 Q2 "what each scheduled run costs": the scheduled runs are the harness "team" runs (run records). Unknown cost
//     stays null (never 0); counts of known and unknown; mean over known only; all unknown -> mean/total null.
//     No team runs -> status "no-data".
//  A3 Q3 "which claims lack evidence": count of claims with hasEvidence === false over all runs, with the claim total
//     and a rate (null, not 0, with no claims). No claims at all -> status "no-data". Zero unsupported of some -> a real 0.
//  A4 Every answer carries provenance { sources, n, runIds }: sources = the source sets that contributed
//     (claude-code -> "fixtures/claude-code", codex -> "fixtures/codex", team -> "runs/"), sorted; n = what was counted
//     (Q1 skill invocations, Q2 team runs, Q3 claims); runIds = ids (non-null) of contributing runs, in input order.
//     No data -> sources [] and n 0. The function is pure (inputs not mutated) and agrees with an independent tally of the
//     real fixtures + run records.
//
// CONTRACT: src/lib/p1-questions.ts exports `answerP1Questions(runs: readonly Run[]): P1Answers` with
//   skillFailures: { status: "answered"|"no-failures"|"no-data"; top: {skill,invocations,failures,failureRate:number|null}[];
//                    ranking: same row shape for every skill, failures desc, rate desc (null last), name asc;
//                    provenance }
//   runCost:       { status: "answered"|"no-data"; runs: number; knownCost: number; unknownCost: number;
//                    totalUsd: number|null; meanUsd: number|null; provenance }
//   unsupportedClaims: { status: "answered"|"no-data"; claims: number; unsupported: number; unsupportedRate: number|null; provenance }
//   provenance: { sources: string[]; n: number; runIds: string[] }
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { answerP1Questions } from "../src/lib/p1-questions";
import { parseClaudeCode, parseCodex, parseRunRecord, type Claim, type Harness, type Run, type ToolCall } from "../src/lib/ingest";

const call = (skill: string | null, isError: boolean | null): ToolCall => ({
  id: null, name: skill === null ? "Read" : "Skill", startedAt: null, endedAt: null, durationMs: null, isError, skill,
});
const claim = (hasEvidence: boolean, stepIndex = 0): Claim => ({ text: `claim ${stepIndex}`, hasEvidence, stepIndex });
function mk(harness: Harness, id: string | null, o: { calls?: ToolCall[]; claims?: Claim[]; cost?: number | null } = {}): Run {
  return {
    harness, id, startedAt: null, endedAt: null, durationMs: null, steps: [], toolCalls: o.calls ?? [], usage: null,
    verdicts: [], claims: o.claims ?? [], recordCount: 0, droppedCount: 0,
    team: harness === "team" ? { taskId: null, mode: null, prNumber: null, freezeSha: null, costUsd: o.cost ?? null, branch: null, base: null, phase: null } : undefined,
  };
}

describe("HL-016 A1: which skill fails most often", () => {
  const runs = [
    mk("claude-code", "cc-1", { calls: [call("alpha", true), call("alpha", false), call("beta", true), call(null, true)] }),
    mk("claude-code", "cc-2", { calls: [call("alpha", true), call("beta", null), call("gamma", false)] }),
  ];
  it("returns the skill with the most failures, with its invocations, failures and rate", () => {
    const a = answerP1Questions(runs).skillFailures;
    expect(a.status).toBe("answered");
    expect(a.top).toHaveLength(1);
    expect(a.top[0]).toMatchObject({ skill: "alpha", invocations: 3, failures: 2 });
    expect(a.top[0]!.failureRate).toBeCloseTo(2 / 3, 5);
  });
  it("ignores non-skill calls that failed, and does not count unknown outcomes as failures", () => {
    const rank = answerP1Questions(runs).skillFailures.ranking;
    const beta = rank.find((r) => r.skill === "beta")!;
    expect(beta).toMatchObject({ invocations: 2, failures: 1 });
    expect(rank.map((r) => r.skill)).not.toContain("Read");
    expect(rank.map((r) => r.skill)).not.toContain("");
  });
  it("ranks by failures desc, then rate desc, then name", () => {
    expect(answerP1Questions(runs).skillFailures.ranking.map((r) => r.skill)).toEqual(["alpha", "beta", "gamma"]);
  });
  it("returns every skill tied for most failures, in name order", () => {
    const a = answerP1Questions([mk("claude-code", "t", { calls: [call("zed", true), call("amy", true), call("mid", false)] })]).skillFailures;
    expect(a.status).toBe("answered");
    expect(a.top.map((r) => r.skill)).toEqual(["amy", "zed"]);
  });
  it("with skill invocations but no failures, says no-failures and names no skill", () => {
    const a = answerP1Questions([mk("claude-code", "n", { calls: [call("alpha", false), call("beta", null)] })]).skillFailures;
    expect(a.status).toBe("no-failures");
    expect(a.top).toEqual([]);
  });
  it("with no skill invocations at all, says no-data", () => {
    for (const rs of [[], [mk("codex", "c", { calls: [call(null, true)] })]]) {
      const a = answerP1Questions(rs).skillFailures;
      expect(a.status).toBe("no-data");
      expect(a.top).toEqual([]);
      expect(a.ranking).toEqual([]);
    }
  });
  it("a skill whose outcomes are all unknown has a null rate, not 0", () => {
    const a = answerP1Questions([mk("claude-code", "u", { calls: [call("solo", null), call("fail", true)] })]).skillFailures;
    expect(a.ranking.find((r) => r.skill === "solo")!.failureRate).toBeNull();
  });
});

describe("HL-016 A2: what each scheduled run costs", () => {
  it("counts known and unknown costs; the mean and total use known costs only", () => {
    const a = answerP1Questions([mk("team", "r1", { cost: 0.5 }), mk("team", "r2", { cost: 1.5 }), mk("team", "r3", { cost: null })]).runCost;
    expect(a.status).toBe("answered");
    expect(a).toMatchObject({ runs: 3, knownCost: 2, unknownCost: 1 });
    expect(a.totalUsd).toBeCloseTo(2, 6);
    expect(a.meanUsd).toBeCloseTo(1, 6);
  });
  it("a real 0 cost is a known value, distinct from unknown", () => {
    const a = answerP1Questions([mk("team", "r1", { cost: 0 }), mk("team", "r2", { cost: null })]).runCost;
    expect(a).toMatchObject({ knownCost: 1, unknownCost: 1, meanUsd: 0, totalUsd: 0 });
  });
  it("all costs unknown -> mean and total are null, never 0", () => {
    const a = answerP1Questions([mk("team", "r1"), mk("team", "r2")]).runCost;
    expect(a.status).toBe("answered");
    expect(a).toMatchObject({ runs: 2, knownCost: 0, unknownCost: 2, meanUsd: null, totalUsd: null });
  });
  it("only team runs are scheduled runs; fixture harnesses are ignored", () => {
    const a = answerP1Questions([mk("claude-code", "c"), mk("codex", "x"), mk("team", "r1", { cost: 2 })]).runCost;
    expect(a).toMatchObject({ runs: 1, knownCost: 1, unknownCost: 0 });
    expect(a.meanUsd).toBeCloseTo(2, 6);
  });
  it("no team runs -> no-data", () => {
    for (const rs of [[], [mk("codex", "x")]]) {
      const a = answerP1Questions(rs).runCost;
      expect(a.status).toBe("no-data");
      expect(a).toMatchObject({ runs: 0, meanUsd: null, totalUsd: null });
    }
  });
});

describe("HL-016 A3: which claims lack evidence", () => {
  it("counts unsupported claims over all harnesses, with the claim total and rate", () => {
    const a = answerP1Questions([
      mk("claude-code", "a", { claims: [claim(true, 0), claim(false, 1), claim(false, 2)] }),
      mk("codex", "b", { claims: [claim(true, 0), claim(true, 1), claim(false, 2)] }),
    ]).unsupportedClaims;
    expect(a.status).toBe("answered");
    expect(a).toMatchObject({ claims: 6, unsupported: 3 });
    expect(a.unsupportedRate).toBeCloseTo(0.5, 6);
  });
  it("all claims supported is a real zero, not no-data", () => {
    const a = answerP1Questions([mk("codex", "b", { claims: [claim(true)] })]).unsupportedClaims;
    expect(a).toMatchObject({ status: "answered", claims: 1, unsupported: 0, unsupportedRate: 0 });
  });
  it("no claims at all -> no-data with a null rate", () => {
    const a = answerP1Questions([mk("team", "r"), mk("codex", "x")]).unsupportedClaims;
    expect(a).toMatchObject({ status: "no-data", claims: 0, unsupported: 0, unsupportedRate: null });
  });
});

describe("HL-016 A4: provenance and purity", () => {
  const runs = [
    mk("claude-code", "cc-1", { calls: [call("alpha", true), call("alpha", false)], claims: [claim(false)] }),
    mk("codex", "cx-1", { claims: [claim(true), claim(false)] }),
    mk("team", "tm-1", { cost: 1 }),
    mk("team", null, { cost: null }),
  ];
  it("Q1 provenance: the source set with skill calls, invocations counted, contributing run ids", () => {
    expect(answerP1Questions(runs).skillFailures.provenance).toEqual({ sources: ["fixtures/claude-code"], n: 2, runIds: ["cc-1"] });
  });
  it("Q2 provenance: the run-record source, the team run count, the non-null ids", () => {
    expect(answerP1Questions(runs).runCost.provenance).toEqual({ sources: ["runs/"], n: 2, runIds: ["tm-1"] });
  });
  it("Q3 provenance: every source that has claims, the claim count, contributing run ids in input order", () => {
    expect(answerP1Questions(runs).unsupportedClaims.provenance).toEqual({ sources: ["fixtures/claude-code", "fixtures/codex"], n: 3, runIds: ["cc-1", "cx-1"] });
  });
  it("no data -> empty sources, n 0, no run ids", () => {
    const a = answerP1Questions([]);
    for (const p of [a.skillFailures.provenance, a.runCost.provenance, a.unsupportedClaims.provenance]) {
      expect(p).toEqual({ sources: [], n: 0, runIds: [] });
    }
  });
  it("does not mutate its input", () => {
    const before = JSON.stringify(runs);
    answerP1Questions(runs);
    expect(JSON.stringify(runs)).toBe(before);
  });
});

describe("HL-016 A4: agrees with an independent tally of the real fixtures and run records", () => {
  const read = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => readFileSync(`${dir}/${f}`, "utf8"));
  const real: Run[] = [
    ...read("fixtures/claude-code").map((t) => parseClaudeCode(t)),
    ...read("fixtures/codex").map((t) => parseCodex(t)),
    ...readdirSync("runs").filter((f) => f.endsWith(".json")).map((f) => parseRunRecord(readFileSync(`runs/${f}`, "utf8"))),
  ];
  const a = answerP1Questions(real);
  it("Q3 matches a plain count of hasEvidence === false", () => {
    const all = real.flatMap((r) => r.claims);
    expect(a.unsupportedClaims.claims).toBe(all.length);
    expect(a.unsupportedClaims.unsupported).toBe(all.filter((c) => c.hasEvidence === false).length);
    expect(a.unsupportedClaims.provenance.n).toBe(all.length);
  });
  it("Q2 matches a plain count of team runs and null costs", () => {
    const team = real.filter((r) => r.harness === "team");
    expect(a.runCost.runs).toBe(team.length);
    expect(a.runCost.unknownCost).toBe(team.filter((r) => r.team?.costUsd == null).length);
    expect(a.runCost.provenance.n).toBe(team.length);
  });
  it("Q1 matches a plain tally of failed Skill calls", () => {
    const fails = new Map<string, number>();
    let inv = 0;
    for (const r of real) for (const c of r.toolCalls) if (typeof c.skill === "string" && c.skill !== "") {
      inv += 1;
      fails.set(c.skill, (fails.get(c.skill) ?? 0) + (c.isError === true ? 1 : 0));
    }
    expect(a.skillFailures.provenance.n).toBe(inv);
    const max = Math.max(0, ...fails.values());
    if (inv === 0) expect(a.skillFailures.status).toBe("no-data");
    else if (max === 0) expect(a.skillFailures.status).toBe("no-failures");
    else {
      expect(a.skillFailures.status).toBe("answered");
      expect(a.skillFailures.top.map((r) => r.skill)).toEqual([...fails].filter(([, n]) => n === max).map(([s]) => s).sort());
      expect(a.skillFailures.top[0]!.failures).toBe(max);
    }
  });
});
