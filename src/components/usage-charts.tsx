import { Bar, BarChart, CartesianGrid, Label, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { DASH } from "@/lib/format-duration";
import type { HarnessSummary, Metric } from "@/lib/usage-summary";

// HL-011a: p50/p95/p99 per harness for latency, tokens and cost. Grouped bars (bars start at
// zero, DESIGN.md chart conventions); each bar carries its percentile name as a direct label, so
// color never carries meaning alone. Every chart is paired with a data table and a source footer.

type Key = "latencyMs" | "tokens" | "costUsd";
const SERIES = [
  { key: "p50", color: "var(--chart-1)" },
  { key: "p95", color: "var(--chart-2)" },
  { key: "p99", color: "var(--chart-3)" },
] as const;

const fmtInt = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
const fmtCompact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const fmtUsd = (v: number) => `$${v.toFixed(2)}`;

const METRICS: { key: Key; title: string; caption: string; axis: string; empty: string; tick: (v: number) => string; cell: (v: number) => string }[] = [
  { key: "latencyMs", title: "Latency", caption: "Latency percentiles by harness, in ms", axis: "Latency (ms)", empty: "No run reports a duration.", tick: fmtCompact, cell: fmtInt },
  { key: "tokens", title: "Tokens", caption: "Token percentiles by harness, in tokens", axis: "Total tokens per run (tokens)", empty: "No run reports a token total.", tick: fmtCompact, cell: fmtInt },
  { key: "costUsd", title: "Cost", caption: "Cost percentiles by harness, in USD", axis: "Cost per run (USD)", empty: "No run reports a cost.", tick: fmtUsd, cell: fmtUsd },
];

const tick = { fill: "var(--muted-foreground)", fontSize: 12 };
const th = "px-2 py-1.5 text-left font-normal text-muted-foreground whitespace-nowrap";
const td = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";

function hasValues(m: Metric) {
  return m.n > 0;
}

function SeriesLabel({ x, y, width, name }: { x?: number | string; y?: number | string; width?: number | string; name: string }) {
  if (x === undefined || y === undefined || width === undefined) return null;
  return (
    <text x={Number(x) + Number(width) / 2} y={Number(y) - 4} textAnchor="middle" fontSize={10} fill="var(--foreground)">
      {name}
    </text>
  );
}

function MetricChart({ rows, spec }: { rows: HarnessSummary[]; spec: (typeof METRICS)[number] }) {
  const { key } = spec;
  const source = `Source: ${rows.map((r) => `${r.harness} ${r[key].n} of ${r.runs} ${r.runs === 1 ? "run" : "runs"}`).join("; ") || "0 runs"} (claude-code and codex: synthetic fixtures; team: run records). Nearest-rank percentiles.`;
  const present = rows.some((r) => hasValues(r[key]));
  const data = rows.map((r) => ({ harness: r.harness, p50: r[key].p50, p95: r[key].p95, p99: r[key].p99 }));
  const headingId = `usage-${key}`;

  return (
    <figure aria-labelledby={headingId} className="m-0 min-w-0 rounded-md border p-4">
      <h3 id={headingId} className="mb-3 text-base font-semibold">{spec.title}</h3>
      {present ? (
        <>
          <div className="h-72 w-full" role="img" aria-label={`Grouped bar chart of ${spec.title.toLowerCase()} p50, p95 and p99 by harness. The data table below has the same values.`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="harness" tick={tick} stroke="var(--border)" />
                <YAxis tick={tick} stroke="var(--border)" domain={[0, "auto"]} width={64} tickFormatter={spec.tick}>
                  <Label value={spec.axis} angle={-90} position="insideLeft" offset={-2} style={{ textAnchor: "middle" }} fill="var(--muted-foreground)" fontSize={12} />
                </YAxis>
                {SERIES.map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.key}
                    fill={s.color}
                    isAnimationActive={false}
                    label={(p: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) =>
                      p.value === null || p.value === undefined ? <g key={`${s.key}-none`} /> : <SeriesLabel key={s.key} x={p.x} y={p.y} width={p.width} name={s.key} />
                    }
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div tabIndex={0} role="region" aria-label={`${spec.title} data table, scrollable`} className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring">
            <table className="w-full font-mono text-sm">
              <caption className="mb-1 text-left text-xs text-muted-foreground">{spec.caption}</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>Harness</th>
                  <th scope="col" className={`${th} text-right`}>p50</th>
                  <th scope="col" className={`${th} text-right`}>p95</th>
                  <th scope="col" className={`${th} text-right`}>p99</th>
                  <th scope="col" className={`${th} text-right`}>n</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.harness} className="border-t">
                    <th scope="row" className="px-2 py-1.5 text-left font-normal whitespace-nowrap">{r.harness}</th>
                    {(["p50", "p95", "p99"] as const).map((q) => (
                      <td key={q} className={td}>{r[key][q] === null ? DASH : spec.cell(r[key][q] as number)}</td>
                    ))}
                    <td className={td}>{r[key].n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div role="status" className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">No data</p>
          <p>{spec.empty}</p>
        </div>
      )}
      <figcaption className="mt-3 text-xs text-muted-foreground">{source}</figcaption>
    </figure>
  );
}

export function UsageCharts({ rows }: { rows: HarnessSummary[] }) {
  return (
    <section aria-labelledby="usage-heading">
      <h2 id="usage-heading" className="mb-3 text-lg font-semibold">Cost, tokens and latency by harness</h2>
      <div className="grid gap-4">
        {METRICS.map((spec) => (
          <MetricChart key={spec.key} rows={rows} spec={spec} />
        ))}
      </div>
    </section>
  );
}
