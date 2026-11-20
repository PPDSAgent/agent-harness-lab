// HL-050: P3 evidence-delta scorer. Pure functions over recorded responses: no model call, no API key.
// Headline (Will, 2026-11-11): share of claims that link to a source that actually supports them.
// Absent inputs are null, never 0 or an estimate (CLAUDE.md rule 5).

export type EvalCase = {
  id: string;
  synthetic: true;
  difficulty: "easy" | "hard";
  hard_kind?: string;
  note?: string;
  question: string;
  sources: { id: string; text: string }[];
  gold_claims: { id: string; text: string; support: string[] }[];
  planted: { id: string; text: string; cited: string[]; kind: "wrong" | "unsupported" }[];
};

export type RunClaim = { text: string; cited: string[]; gold_id?: string; planted_id?: string };
export type RunCase = {
  case_id: string;
  claims: RunClaim[];
  flagged?: string[];
  verify_seconds?: number;
  approved_first_time?: boolean;
  rubric?: { accuracy: number; correctness: number; style: number };
};
export type Run = {
  label: "recorded-response";
  model_id: string;
  date?: string;
  settings?: unknown;
  arm?: string;
  cases: RunCase[];
};

export type Score = {
  label: "recorded-response";
  model_id: string;
  n: number;
  headline: number | null;
  planted_caught: number | null;
  mean_verify_seconds: number | null;
  first_time_approval: number | null;
  rubric: { accuracy: number | null; correctness: number | null; style: number | null; overall: number | null } | null;
  per_case: { case_id: string; claims: number; supported: number; headline: number | null }[];
};

export type Delta = {
  label: "recorded-response";
  baseline_model_id: string;
  candidate_model_id: string;
  n: number;
  per_case: { case_id: string; baseline: number | null; candidate: number | null; delta: number | null }[];
  headline_delta: number | null;
  worse: string[];
  baseline: Score;
  candidate: Score;
};

const EXPECTED_CASES = 20;

export function loadCases(jsonl: string): EvalCase[] {
  const cases = jsonl
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l, i) => {
      try {
        return JSON.parse(l) as EvalCase;
      } catch {
        throw new Error(`cases line ${i + 1}: invalid JSON`);
      }
    });
  if (cases.length !== EXPECTED_CASES) throw new Error(`expected ${EXPECTED_CASES} cases, got ${cases.length}`);
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) throw new Error(`duplicate case id ${c.id}`);
    seen.add(c.id);
    if (c.synthetic !== true) throw new Error(`case ${c.id} is not marked synthetic`);
    const ids = new Set(c.sources.map((s) => s.id));
    for (const g of c.gold_claims) {
      for (const s of g.support) if (!ids.has(s)) throw new Error(`case ${c.id}: gold ${g.id} supports unknown source ${s}`);
    }
    for (const p of c.planted) {
      for (const s of p.cited) if (!ids.has(s)) throw new Error(`case ${c.id}: planted ${p.id} cites unknown source ${s}`);
    }
  }
  return cases;
}

const mean = (xs: number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

function isSupported(c: EvalCase | undefined, claim: RunClaim): boolean {
  if (!c || claim.planted_id !== undefined || claim.gold_id === undefined) return false;
  const gold = c.gold_claims.find((g) => g.id === claim.gold_id);
  if (!gold || claim.cited.length === 0) return false;
  return claim.cited.every((id) => gold.support.includes(id));
}

export function scoreRun(cases: EvalCase[], run: Run): Score {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const per_case = run.cases.map((rc) => {
    const c = byId.get(rc.case_id);
    const supported = rc.claims.filter((cl) => isSupported(c, cl)).length;
    return {
      case_id: rc.case_id,
      claims: rc.claims.length,
      supported,
      headline: rc.claims.length === 0 ? null : supported / rc.claims.length,
    };
  });
  const totalClaims = per_case.reduce((a, p) => a + p.claims, 0);
  const totalSupported = per_case.reduce((a, p) => a + p.supported, 0);

  let caught = 0;
  let planted = 0;
  for (const rc of run.cases) {
    if (!rc.flagged) continue;
    const ids = new Set((byId.get(rc.case_id)?.planted ?? []).map((p) => p.id));
    planted += ids.size;
    caught += new Set(rc.flagged.filter((f) => ids.has(f))).size;
  }

  const times = run.cases.flatMap((rc) => (typeof rc.verify_seconds === "number" ? [rc.verify_seconds] : []));
  const approvals = run.cases.flatMap((rc) => (typeof rc.approved_first_time === "boolean" ? [rc.approved_first_time ? 1 : 0] : []));
  const rubrics = run.cases.flatMap((rc) => (rc.rubric ? [rc.rubric] : []));
  const accuracy = mean(rubrics.map((r) => r.accuracy));
  const correctness = mean(rubrics.map((r) => r.correctness));
  const style = mean(rubrics.map((r) => r.style));

  return {
    label: run.label,
    model_id: run.model_id,
    n: run.cases.length,
    headline: totalClaims === 0 ? null : totalSupported / totalClaims,
    planted_caught: planted === 0 ? null : caught / planted,
    mean_verify_seconds: mean(times),
    first_time_approval: mean(approvals),
    rubric:
      rubrics.length === 0
        ? null
        : { accuracy, correctness, style, overall: ((accuracy ?? 0) + (correctness ?? 0) + (style ?? 0)) / 3 },
    per_case,
  };
}

function checkRun(name: string, run: Run): void {
  if (run.label !== "recorded-response") throw new Error(`${name}: label must be "recorded-response"`);
  if (typeof run.model_id !== "string" || run.model_id === "") throw new Error(`${name}: model_id is missing`);
}

export function compareRuns(cases: EvalCase[], baseline: Run, candidate: Run): Delta {
  checkRun("baseline", baseline);
  checkRun("candidate", candidate);
  const b = baseline.cases.map((c) => c.case_id);
  const c = candidate.cases.map((x) => x.case_id);
  const bs = new Set(b);
  const cs = new Set(c);
  if (bs.size !== b.length || cs.size !== c.length) throw new Error("a run repeats a case id");
  if (bs.size !== cs.size || [...bs].some((id) => !cs.has(id))) throw new Error("runs do not cover the same case ids");
  const known = new Set(cases.map((x) => x.id));
  for (const id of bs) if (!known.has(id)) throw new Error(`run covers unknown case id ${id}`);

  const bScore = scoreRun(cases, baseline);
  const cScore = scoreRun(cases, candidate);
  const bMap = new Map(bScore.per_case.map((p) => [p.case_id, p.headline]));
  const cMap = new Map(cScore.per_case.map((p) => [p.case_id, p.headline]));
  const per_case = cases
    .filter((x) => bs.has(x.id))
    .map((x) => {
      const bh = bMap.get(x.id) ?? null;
      const ch = cMap.get(x.id) ?? null;
      return { case_id: x.id, baseline: bh, candidate: ch, delta: bh === null || ch === null ? null : ch - bh };
    });
  const worse = per_case
    .filter((p) => p.baseline !== null && (p.candidate === null || p.candidate < p.baseline))
    .map((p) => p.case_id);
  return {
    label: "recorded-response",
    baseline_model_id: baseline.model_id,
    candidate_model_id: candidate.model_id,
    n: per_case.length,
    per_case,
    headline_delta: bScore.headline === null || cScore.headline === null ? null : cScore.headline - bScore.headline,
    worse,
    baseline: bScore,
    candidate: cScore,
  };
}
