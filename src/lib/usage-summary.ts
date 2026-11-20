import type { Harness, Run } from "./ingest";
import { percentile } from "./ingest";

// HL-011a: per-harness p50/p95/p99 of latency, tokens and cost. Percentiles are the HL-005
// nearest-rank helper (src/lib/ingest/stats.ts). Null/absent values are excluded and counted
// in `missing`; a metric with no values has null percentiles, never 0. Pure: inputs are not mutated.

export interface Metric {
  p50: number | null;
  p95: number | null;
  p99: number | null;
  n: number;
  missing: number;
}

export interface HarnessSummary {
  harness: Harness;
  runs: number;
  latencyMs: Metric;
  tokens: Metric;
  costUsd: Metric;
}

export const HARNESS_ORDER: readonly Harness[] = ["claude-code", "codex", "team"];

function metricOf(values: readonly (number | null | undefined)[]): Metric {
  const present = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return {
    p50: percentile(present, 50),
    p95: percentile(present, 95),
    p99: percentile(present, 99),
    n: present.length,
    missing: values.length - present.length,
  };
}

export function summarizeByHarness(runs: readonly Run[]): HarnessSummary[] {
  const rows: HarnessSummary[] = [];
  for (const harness of HARNESS_ORDER) {
    const mine = runs.filter((r) => r.harness === harness);
    if (mine.length === 0) continue;
    rows.push({
      harness,
      runs: mine.length,
      latencyMs: metricOf(mine.map((r) => r.durationMs)),
      tokens: metricOf(mine.map((r) => r.usage?.totalTokens)),
      costUsd: metricOf(mine.map((r) => r.team?.costUsd)),
    });
  }
  return rows;
}

// HL-011b: per-skill rows. A run counts once for each distinct skill it invoked (any number of
// times); runs that invoked no skill are in no row. Sorted by skill name (code-unit order).
export interface SkillSummary {
  skill: string;
  runs: number;
  latencyMs: Metric;
  tokens: Metric;
  costUsd: Metric;
}

export function summarizeBySkill(runs: readonly Run[]): SkillSummary[] {
  const bySkill = new Map<string, Run[]>();
  for (const run of runs) {
    const seen = new Set<string>();
    for (const c of run.toolCalls) if (typeof c.skill === "string" && c.skill !== "") seen.add(c.skill);
    for (const s of seen) {
      const list = bySkill.get(s) ?? [];
      list.push(run);
      bySkill.set(s, list);
    }
  }
  return [...bySkill.keys()].sort().map((skill) => {
    const mine = bySkill.get(skill) as Run[];
    return {
      skill,
      runs: mine.length,
      latencyMs: metricOf(mine.map((r) => r.durationMs)),
      tokens: metricOf(mine.map((r) => r.usage?.totalTokens)),
      costUsd: metricOf(mine.map((r) => r.team?.costUsd)),
    };
  });
}
