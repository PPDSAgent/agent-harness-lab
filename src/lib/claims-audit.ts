import type { Harness, Run } from "./ingest";

// HL-013: unsupported-claims audit. Pure; reads only the normalized Run model (Claim.hasEvidence is set by the ingest layer).

export interface AuditRow {
  runId: string | null;
  harness: Harness;
  stepIndex: number;
  text: string;
}
export interface HarnessClaimTotals {
  harness: Harness;
  claims: number;
  unsupported: number;
  /** unsupported / claims; null (not 0) when there are no claims. */
  unsupportedRate: number | null;
}

const ORDER: Harness[] = ["claude-code", "codex", "team"];
const rank = (h: Harness) => {
  const i = ORDER.indexOf(h);
  return i === -1 ? ORDER.length : i;
};
const time = (s: string | null): number => {
  if (s === null) return Number.POSITIVE_INFINITY;
  const t = Date.parse(s);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};
const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
const cmpStr = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "en");

export function auditClaims(runs: readonly Run[]): { rows: AuditRow[]; byHarness: HarnessClaimTotals[] } {
  const totals = new Map<Harness, { claims: number; unsupported: number }>();
  const keyed: { row: AuditRow; t: number }[] = [];
  for (const run of runs) {
    const tot = totals.get(run.harness) ?? { claims: 0, unsupported: 0 };
    totals.set(run.harness, tot);
    const t = time(run.startedAt);
    for (const claim of run.claims) {
      tot.claims += 1;
      if (claim.hasEvidence === false) {
        tot.unsupported += 1;
        keyed.push({ row: { runId: run.id, harness: run.harness, stepIndex: claim.stepIndex, text: claim.text }, t });
      }
    }
  }
  keyed.sort(
    (a, b) =>
      cmp(rank(a.row.harness), rank(b.row.harness)) ||
      cmp(a.t, b.t) ||
      cmpStr(a.row.runId, b.row.runId) ||
      cmp(a.row.stepIndex, b.row.stepIndex) ||
      cmpStr(a.row.text, b.row.text),
  );
  const byHarness = [...totals.entries()]
    .sort((a, b) => cmp(rank(a[0]), rank(b[0])))
    .map(([harness, v]) => ({ harness, claims: v.claims, unsupported: v.unsupported, unsupportedRate: v.claims === 0 ? null : v.unsupported / v.claims }));
  return { rows: keyed.map((k) => k.row), byHarness };
}
