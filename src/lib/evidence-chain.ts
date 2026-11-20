// Pure evidence-chain mapping over the team's own run records (runs/SCHEMA.md). HL-021a A1/A2.
export type Verdict = "PASS" | "CONDITIONAL" | "FAIL";
export type EvidenceChain = {
  runId: string | null;
  taskId: string | null;
  mode: string | null;
  pr: { number: number; url: string } | null;
  review: { verdict: Verdict; path: string } | null;
  brokenCheck: { fileLine: string; wentRed: boolean | null } | null;
};

const PR_BASE = "https://github.com/PPDSAgent/harness-lab/pull/";
const VERDICTS: readonly string[] = ["PASS", "CONDITIONAL", "FAIL"];

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function evidenceChain(record: unknown): EvidenceChain {
  const r = obj(record) ?? {};
  const date = str(r.run_date);
  const slot = str(r.slot);
  const n = r.pr_number;
  const rv = obj(r.review);
  const mc = obj(r.mutation_check);
  const verdict = rv && typeof rv.verdict === "string" && VERDICTS.includes(rv.verdict) ? (rv.verdict as Verdict) : null;
  const rpath = rv ? str(rv.path) : null;
  const fileLine = mc ? str(mc.file_line) : null;
  return {
    runId: date && slot ? `${date}T${slot}` : null,
    taskId: str(r.task_id),
    mode: str(r.mode),
    pr: typeof n === "number" && Number.isInteger(n) && n > 0 ? { number: n, url: `${PR_BASE}${n}` } : null,
    review: verdict && rpath ? { verdict, path: rpath } : null,
    brokenCheck: fileLine ? { fileLine, wentRed: typeof mc?.went_red === "boolean" ? mc.went_red : null } : null,
  };
}

// Every chain kept here has a run id (a record without one cannot be placed in time), so the type says so.
export type KeptChain = EvidenceChain & { runId: string };
export function evidenceChains(records: readonly unknown[]): KeptChain[] {
  return records
    .map(evidenceChain)
    .filter((c): c is KeptChain => c.runId !== null && (c.mode === "BUILD" || c.mode === "FIX"))
    .sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0));
}

/** B1 (HL-021b): the chain for a normalized team Run, from the raw run records. Null for other harnesses, a null id or no match. Never throws. */
export function chainForRun(run: { harness?: unknown; id?: unknown } | null | undefined, records: readonly unknown[]): EvidenceChain | null {
  if (!run || typeof run !== "object" || run.harness !== "team" || typeof run.id !== "string" || !Array.isArray(records)) return null;
  for (const record of records) {
    const c = evidenceChain(record);
    if (c.runId === run.id) return c;
  }
  return null;
}
