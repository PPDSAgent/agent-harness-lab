import { DASH, formatDuration } from "@/lib/format-duration";
import { compareHarnesses, type HarnessComparisonRow } from "@/lib/harness-comparison";
import type { Run } from "@/lib/ingest";

// HL-014: harnesses side by side, one column each. Loaded lazily from App (HL-011a budget).
// Rates are shares of the counted items (tool calls with a known outcome, verdicts, claims);
// a harness with nothing to count shows a dash, not 0%.

const pct = (r: number | null) => (r === null ? DASH : `${Math.round(r * 100)}%`);
const tokens = (n: number | null) => (n === null ? DASH : Math.round(n).toLocaleString("en-US"));

const METRICS: { label: string; cell: (r: HarnessComparisonRow) => string }[] = [
  { label: "Runs", cell: (r) => String(r.runs) },
  { label: "Tool-call error rate", cell: (r) => pct(r.toolCallErrorRate) },
  { label: "Median duration", cell: (r) => formatDuration(r.medianDurationMs) },
  { label: "p95 duration", cell: (r) => formatDuration(r.p95DurationMs) },
  { label: "Median tokens", cell: (r) => tokens(r.medianTokens) },
  { label: "Verdict pass rate", cell: (r) => pct(r.verdictPassRate) },
  { label: "Unsupported-claim share", cell: (r) => pct(r.unsupportedClaimShare) },
];

export default function HarnessComparison({ runs }: { runs: Run[] }) {
  const rows = compareHarnesses(runs);
  return (
    <section aria-label="Compare harnesses" className="min-w-0">
      <p className="text-xs text-muted-foreground">
        Durations and tokens are nearest-rank percentiles per run; a dash means no data.
      </p>
      <p className="mt-2 text-xs text-muted-foreground sm:hidden" aria-hidden="true">Swipe the table sideways to see every harness.</p>
      <div
        tabIndex={0}
        role="region"
        aria-label="Harness comparison table, scrollable"
        className="mt-1 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table className="w-full font-mono text-sm">
          <caption className="sticky left-0 mb-1 w-[calc(100vw-2rem)] max-w-full text-left text-xs text-muted-foreground sm:w-auto">Per-harness metrics</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-background px-2 py-1.5 text-left font-normal text-muted-foreground whitespace-nowrap">Metric</th>
              {rows.map((r) => (
                <th key={r.harness} scope="col" className="px-2 py-1.5 text-right font-normal text-muted-foreground whitespace-nowrap">{r.harness}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.label} className="border-t">
                <th scope="row" className="sticky left-0 bg-background px-2 py-1.5 text-left font-normal whitespace-nowrap">{m.label}</th>
                {rows.map((r) => (
                  <td key={r.harness} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{m.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Source: ingested run records (claude-code and codex: synthetic fixtures; team: run records). Rates count only tool calls with a known outcome, all verdicts and all claims.
      </p>
    </section>
  );
}
