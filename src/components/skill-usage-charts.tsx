import { Bar, BarChart, CartesianGrid, Label, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { DASH } from "@/lib/format-duration";
import type { Run } from "@/lib/ingest";
import { summarizeBySkill } from "@/lib/usage-summary";
import type { Metric, SkillSummary } from "@/lib/usage-summary";

// HL-011b: p50/p95/p99 of latency and tokens per skill. Same conventions as usage-charts.tsx
// (grouped bars from zero, direct series labels, chart paired with a data table and a source line).
// Loaded lazily from App so the initial-JS budget (HL-011a) is not spent on it.

const SERIES = [
  { key: "p50", color: "var(--chart-1)" },
  { key: "p95", color: "var(--chart-2)" },
  { key: "p99", color: "var(--chart-3)" },
] as const;

const fmtInt = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
const fmtCompact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

type Key = "latencyMs" | "tokens";
const METRICS: { key: Key; title: string; caption: string; axis: string; empty: string }[] = [
  { key: "latencyMs", title: "Latency", caption: "Latency percentiles by skill, in ms", axis: "Latency (ms)", empty: "No run that used a skill reports a duration." },
  { key: "tokens", title: "Tokens", caption: "Token percentiles by skill, in tokens", axis: "Total tokens per run (tokens)", empty: "No run that used a skill reports a token total." },
];

const tick = { fill: "var(--muted-foreground)", fontSize: 12 };
const th = "px-2 py-1.5 text-left font-normal text-muted-foreground whitespace-nowrap";
const td = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
const hasValues = (m: Metric) => m.n > 0;

// Bars can be narrower than the 3-letter label (390 px, several skills), so the label is set
// vertically above its bar: it then needs only ~12 px of width, and neighbours never touch.
function SeriesLabel({ x, y, width, name }: { x?: number | string; y?: number | string; width?: number | string; name: string }) {
  if (x === undefined || y === undefined || width === undefined) return null;
  const cx = Number(x) + Number(width) / 2;
  const cy = Number(y) - 4;
  return (
    <text x={cx} y={cy} transform={`rotate(-90 ${cx} ${cy})`} dominantBaseline="central" textAnchor="start" fontSize={10} fill="var(--foreground)">
      {name}
    </text>
  );
}

function SkillMetricChart({ rows, spec }: { rows: SkillSummary[]; spec: (typeof METRICS)[number] }) {
  const { key } = spec;
  const source = `Source: ${rows.map((r) => `${r.skill} ${r[key].n} of ${r.runs} ${r.runs === 1 ? "run" : "runs"}`).join("; ")} (claude-code synthetic fixtures; a run counts once for each skill it invoked). Nearest-rank percentiles.`;
  const present = rows.some((r) => hasValues(r[key]));
  const data = rows.map((r) => ({ skill: r.skill, p50: r[key].p50, p95: r[key].p95, p99: r[key].p99 }));
  const headingId = `skill-usage-${key}`;

  return (
    <figure aria-labelledby={headingId} className="m-0 min-w-0 rounded-md border p-4">
      <h3 id={headingId} className="mb-3 text-base font-semibold">{spec.title}</h3>
      {present ? (
        <div className="h-72 w-full" role="img" aria-label={`Grouped bar chart of ${spec.title.toLowerCase()} p50, p95 and p99 by skill. The data table below has the same values.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 28, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="skill" tick={{ ...tick, angle: -40, textAnchor: "end" }} height={72} stroke="var(--border)" interval={0} />
              <YAxis tick={tick} stroke="var(--border)" domain={[0, "auto"]} width={64} tickFormatter={fmtCompact}>
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
      ) : (
        <div role="status" className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">No data</p>
          <p>{spec.empty}</p>
        </div>
      )}
      {/* The table is always shown so every skill is listed, with — where a metric has no value. */}
      <p className="mt-3 text-xs text-muted-foreground sm:hidden" aria-hidden="true">Swipe the table sideways to scroll to p99 and n.</p>
      <div tabIndex={0} role="region" aria-label={`${spec.title} by skill data table, scrollable`} className="mt-1 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring">
        <table className="w-full font-mono text-sm">
          <caption className="mb-1 text-left text-xs text-muted-foreground">{spec.caption}</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>Skill</th>
              <th scope="col" className={`${th} text-right`}>p50</th>
              <th scope="col" className={`${th} text-right`}>p95</th>
              <th scope="col" className={`${th} text-right`}>p99</th>
              <th scope="col" className={`${th} text-right`}>n</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.skill} className="border-t">
                <th scope="row" className="px-2 py-1.5 text-left font-normal whitespace-nowrap">{r.skill}</th>
                {(["p50", "p95", "p99"] as const).map((q) => (
                  <td key={q} className={td}>{r[key][q] === null ? DASH : fmtInt(r[key][q] as number)}</td>
                ))}
                <td className={td}>{r[key].n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">{source}</figcaption>
    </figure>
  );
}
export default function SkillUsageCharts({ runs }: { runs: readonly Run[] }) {
  const rows = summarizeBySkill(runs);
  return (
    <section aria-labelledby="skill-usage-heading">
      <h2 id="skill-usage-heading" className="mb-3 text-lg font-semibold">Latency and tokens by skill</h2>
      {rows.length === 0 ? (
        <div role="status" className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No run invoked a skill.</div>
      ) : (
        <div className="grid gap-4">
          {METRICS.map((spec) => (
            <SkillMetricChart key={spec.key} rows={rows} spec={spec} />
          ))}
        </div>
      )}
    </section>
  );
}
