import { useId, useState } from "react";
import { DASH } from "@/lib/format-duration";
import { auditClaims } from "@/lib/claims-audit";
import type { Harness, Run } from "@/lib/ingest";

// HL-013: claims that carry no evidence marker, per harness and as a list. Loaded lazily from App (HL-011a budget).
// Claim text is untrusted: it is rendered only as React text children, never as HTML.

const th = "px-2 py-1.5 text-left font-normal text-muted-foreground whitespace-nowrap";
const td = "px-2 py-1.5 whitespace-nowrap";
const num = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
const pct = (r: number | null) => (r === null ? DASH : `${Math.round(r * 100)}%`);
const ALL = "all";

export default function ClaimsAudit({ runs }: { runs: readonly Run[] }) {
  const { rows, byHarness } = auditClaims(runs);
  const [filter, setFilter] = useState<string>(ALL);
  const selectId = useId();
  const total = byHarness.reduce((n, h) => n + h.claims, 0);
  const shown = filter === ALL ? rows : rows.filter((r) => r.harness === (filter as Harness));
  const scope = filter === ALL ? "all harnesses" : filter;

  return (
    <section aria-label="Unsupported claims" className="min-w-0">
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-sm">
          <caption className="mb-1 text-left text-xs text-muted-foreground">Claims and unsupported claims per harness</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>Harness</th>
              <th scope="col" className={`${th} text-right`}>Claims</th>
              <th scope="col" className={`${th} text-right`}>Unsupported</th>
              <th scope="col" className={`${th} text-right`}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {byHarness.map((h) => (
              <tr key={h.harness} className="border-t">
                <th scope="row" className="px-2 py-1.5 text-left font-normal whitespace-nowrap">{h.harness}</th>
                <td className={num}>{h.claims}</td>
                <td className={num}>{h.unsupported}</td>
                <td className={num}>{pct(h.unsupportedRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm">
        <label htmlFor={selectId} className="text-muted-foreground">Harness</label>
        <select
          id={selectId}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border bg-background px-2 py-1 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value={ALL}>All harnesses</option>
          {byHarness.map((h) => (
            <option key={h.harness} value={h.harness}>{h.harness}</option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {rows.length === 0 ? "No unsupported claims in these runs." : `No unsupported claims for ${scope}.`}
        </p>
      ) : (
        <div tabIndex={0} role="region" aria-label="Claim list, scrollable" className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring">
          <table className="block w-full font-mono text-sm sm:table">
            <caption className="mb-1 block text-left sm:table-caption text-xs text-muted-foreground">Claims with no evidence marker ({scope}), by harness, run start and step</caption>
            <thead className="sr-only sm:table-header-group">
              <tr className="sm:table-row">
                <th scope="col" className={th}>Run</th>
                <th scope="col" className={th}>Harness</th>
                <th scope="col" className={`${th} text-right`}>Step</th>
                <th scope="col" className={th}>Claim</th>
              </tr>
            </thead>
            <tbody className="block sm:table-row-group">
              {shown.map((r, i) => (
                <tr key={`${r.runId}-${r.stepIndex}-${i}`} className="flex flex-wrap items-baseline gap-x-3 border-t py-1.5 align-top sm:table-row sm:py-0">
                  <td className={`${td} min-w-0 flex-1 truncate sm:flex-none sm:overflow-visible`} title={r.runId ?? undefined}>{r.runId ?? DASH}</td>
                  <td className={td}>{r.harness}</td>
                  <td className={`${num} before:content-['step_'] sm:before:content-none`}>{r.stepIndex}</td>
                  <td className="basis-full px-2 py-1.5 break-words whitespace-pre-wrap sm:basis-auto">{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="mt-3 text-xs text-muted-foreground">
        Source: synthetic fixture runs and the team run records; {total} {total === 1 ? "claim" : "claims"} checked, {rows.length} without an evidence marker. A team run carries no claims, so its rate is shown as {DASH}.
      </footer>
    </section>
  );
}
