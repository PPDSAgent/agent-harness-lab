import type { Harness, Run } from "./ingest";

// HL-016: pure answers to the three P1 questions (PLAN.md Project 1). Every answer carries provenance:
// the source sets that contributed, how many items were counted (n) and the ids of the contributing runs.
// A failure rate is failures over known outcomes. Unknown values stay null; nothing is estimated.

export interface Provenance { sources: string[]; n: number; runIds: string[] }
export interface SkillRow { skill: string; invocations: number; failures: number; unknown: number; failureRate: number | null }
export interface SkillFailures { status: "answered" | "no-failures" | "no-data"; top: SkillRow[]; ranking: SkillRow[]; provenance: Provenance }
export interface RunCost {
  status: "answered" | "no-data"; runs: number; knownCost: number; unknownCost: number;
  totalUsd: number | null; meanUsd: number | null; provenance: Provenance;
}
export interface UnsupportedClaims {
  status: "answered" | "no-data"; claims: number; unsupported: number; unsupportedRate: number | null; provenance: Provenance;
}
export interface P1Answers { skillFailures: SkillFailures; runCost: RunCost; unsupportedClaims: UnsupportedClaims }

/** Source label per harness: where the data was read from in this repo. */
const SOURCE: Record<Harness, string> = { "claude-code": "fixtures/claude-code", codex: "fixtures/codex", team: "runs/" };

function provenance(contrib: { run: Run; n: number }[]): Provenance {
  const used = contrib.filter((c) => c.n > 0);
  return {
    sources: [...new Set(used.map((c) => SOURCE[c.run.harness]))].sort(),
    n: used.reduce((s, c) => s + c.n, 0),
    runIds: used.flatMap((c) => (c.run.id === null ? [] : [c.run.id])),
  };
}

const rate = (num: number, den: number): number | null => (den === 0 ? null : num / den);
const byRank = (a: SkillRow, b: SkillRow) =>
  b.failures - a.failures ||
  (b.failureRate ?? -1) - (a.failureRate ?? -1) ||
  (a.skill < b.skill ? -1 : a.skill > b.skill ? 1 : 0);

export function answerP1Questions(runs: readonly Run[]): P1Answers {
  // Q1: tool calls whose skill is a non-empty string. Failure = isError === true; null is unknown, not a failure.
  const tally = new Map<string, { invocations: number; failures: number; known: number }>();
  const skillContrib = runs.map((run) => {
    let n = 0;
    for (const c of run.toolCalls) {
      if (typeof c.skill !== "string" || c.skill === "") continue;
      n += 1;
      const t = tally.get(c.skill) ?? { invocations: 0, failures: 0, known: 0 };
      t.invocations += 1;
      if (c.isError === true) t.failures += 1;
      if (c.isError !== null) t.known += 1;
      tally.set(c.skill, t);
    }
    return { run, n };
  });
  const ranking: SkillRow[] = [...tally].map(([skill, t]) => ({
    skill, invocations: t.invocations, failures: t.failures, unknown: t.invocations - t.known,
    failureRate: rate(t.failures, t.known),
  })).sort(byRank);
  const maxFail = ranking[0]?.failures ?? 0;
  const top = maxFail === 0 ? [] : ranking.filter((r) => r.failures === maxFail).sort((a, b) => (a.skill < b.skill ? -1 : 1));
  const skillFailures: SkillFailures = {
    status: ranking.length === 0 ? "no-data" : maxFail === 0 ? "no-failures" : "answered",
    top, ranking, provenance: provenance(skillContrib),
  };

  // Q2: the scheduled runs are the harness "team" run records.
  const team = runs.filter((r) => r.harness === "team");
  const costs = team.flatMap((r) => (typeof r.team?.costUsd === "number" ? [r.team.costUsd] : []));
  const total = costs.reduce((s, c) => s + c, 0);
  const runCost: RunCost = {
    status: team.length === 0 ? "no-data" : "answered",
    runs: team.length, knownCost: costs.length, unknownCost: team.length - costs.length,
    totalUsd: costs.length === 0 ? null : total,
    meanUsd: costs.length === 0 ? null : total / costs.length,
    provenance: provenance(team.map((run) => ({ run, n: 1 }))),
  };

  // Q3: claims with hasEvidence === false, over every harness.
  const all = runs.flatMap((r) => r.claims);
  const unsupported = all.filter((c) => c.hasEvidence === false).length;
  const unsupportedClaims: UnsupportedClaims = {
    status: all.length === 0 ? "no-data" : "answered",
    claims: all.length, unsupported, unsupportedRate: rate(unsupported, all.length),
    provenance: provenance(runs.map((run) => ({ run, n: run.claims.length }))),
  };

  return { skillFailures, runCost, unsupportedClaims };
}
