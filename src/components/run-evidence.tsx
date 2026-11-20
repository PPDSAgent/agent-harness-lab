import { DASH } from "@/lib/format-duration";
import { chainForRun } from "@/lib/evidence-chain";
import { loadRecords } from "@/lib/run-records";
import type { Run } from "@/lib/ingest";

// Lazy chunk (HL-021b B2): the raw run records live here, not in the entry.
export default function RunEvidence({ run }: { run: Run }) {
  const c = chainForRun(run, loadRecords());
  if (!c) return null;
  const red = c.brokenCheck?.wentRed;
  return (
    <section aria-label="Evidence chain" className="mb-4 rounded-md border p-3 text-sm">
      <h3 className="mb-2 font-semibold">Evidence chain</h3>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">PR</dt>
        <dd>
          {c.pr ? (
            <a className="text-evidence underline underline-offset-2" href={c.pr.url} target="_blank" rel="noreferrer">
              #{c.pr.number}
            </a>
          ) : (
            DASH
          )}
        </dd>
        <dt className="text-muted-foreground">Review verdict</dt>
        <dd className="break-words font-mono text-evidence">{c.review ? `${c.review.verdict} · ${c.review.path}` : DASH}</dd>
        <dt className="text-muted-foreground">Broken check</dt>
        <dd className="break-words font-mono text-evidence">
          {c.brokenCheck ? `${c.brokenCheck.fileLine} · ${red === true ? "went red" : red === false ? "did not go red" : DASH}` : DASH}
        </dd>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">Source: the team's own run records (runs/*.json).</p>
    </section>
  );
}
