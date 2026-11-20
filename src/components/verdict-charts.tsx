import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Customized, Label, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { DASH } from "@/lib/format-duration";
import type { Harness, Run } from "@/lib/ingest";
import { passRateTrend, summarizeVerdicts } from "@/lib/verdict-summary";

// HL-012: eval pass rate over time (line, one series per harness) and verdict counts per harness
// (stacked bars). Each chart is paired with a toggleable data table and a source line. Loaded lazily
// from App so the initial-JS budget (HL-011a) is not spent on it. Null pass rates render as a dash.

const COLOR: Record<Harness, string> = { "claude-code": "var(--chart-1)", codex: "var(--chart-2)", team: "var(--chart-3)" };
const BARS = [
  { key: "pass", name: "Pass", color: "var(--chart-1)" },
  { key: "conditional", name: "Conditional", color: "var(--chart-2)" },
  { key: "fail", name: "Fail", color: "var(--chart-4)" },
  { key: "noVerdict", name: "No verdict", color: "var(--muted-foreground)" },
] as const;
const tick = { fill: "var(--muted-foreground)", fontSize: 12 };
const th = "px-2 py-1.5 text-left font-normal text-muted-foreground whitespace-nowrap";
const td = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
const pct = (r: number | null) => (r === null ? DASH : `${Math.round(r * 100)}%`);

// Direct labels drawn inside the SVG (colour is not the only cue). Recharts' <Legend> adds ~20 kB (8 kB gzip)
// and pushed the initial JS over budget; <Customized> costs almost nothing. Width is estimated, 12px text.
function SvgKey({ items }: { items: { name: string; color: string }[] }) {
  const w = (n: string) => 16 + n.length * 6.6 + 14;
  return (
    <g>
      {items.map((i, idx) => {
        const at = 8 + items.slice(0, idx).reduce((sum, p) => sum + w(p.name), 0);
        return (
          <g key={i.name} transform={`translate(${at},4)`}>
            <rect width={12} height={12} rx={2} fill={i.color} />
            <text x={16} y={10.5} fontSize={12} fill="var(--foreground)">{i.name}</text>
          </g>
        );
      })}
    </g>
  );
}
const keyLayer = (items: { name: string; color: string }[]) => <Customized component={() => <SvgKey items={items} />} />;

function Figure({ id, title, label, source, children, table }: { id: string; title: string; label: string; source: string; children: React.ReactNode; table: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <figure aria-labelledby={id} className="m-0 min-w-0 rounded-md border p-4">
      <h3 id={id} className="mb-3 text-base font-semibold">{title}</h3>
      <div className="h-72 w-full" role="img" aria-label={label}>{children}</div>
      <Button variant="secondary" size="sm" className="mt-3 focus-visible:ring-ring" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Hide data table" : "Show data table"}
      </Button>
      {open && (
        <div tabIndex={0} role="region" aria-label={`${title} data table, scrollable`} className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring">
          {table}
        </div>
      )}
      <figcaption className="mt-3 text-xs text-muted-foreground">{source}</figcaption>
    </figure>
  );
}

export default function VerdictCharts({ runs, heading = true }: { runs: readonly Run[]; heading?: boolean }) {
  const trend = passRateTrend(runs);
  const rows = summarizeVerdicts(runs);
  const harnesses = rows.map((r) => r.harness);
  const days = [...new Set(trend.map((p) => p.day))];
  const wide = days.map((day) => {
    const point: Record<string, string | number | null> = { day };
    for (const p of trend) if (p.day === day) point[p.harness] = p.passRate === null ? null : Math.round(p.passRate * 100);
    return point;
  });
  const dated = runs.flatMap((r) => (r.startedAt && !Number.isNaN(Date.parse(r.startedAt)) ? [new Date(r.startedAt).toISOString().slice(0, 10)] : [])).sort();
  const range = dated.length ? `Dates: ${dated[0]} to ${dated[dated.length - 1]} (UTC).` : "Dates: no run has a readable start date.";
  const source = `Source: synthetic fixture runs and the team run records. ${range} A run counts by its last verdict; runs without a verdict are not counted as failures.`;

  return (
    <section aria-label="Eval pass rate">
      {heading && <h2 className="mb-3 text-lg font-semibold">Eval pass rate</h2>}
      {trend.excluded > 0 && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          Note: {trend.excluded} {trend.excluded === 1 ? "run" : "runs"} excluded from the trend: missing or unreadable start date.
        </p>
      )}
      <div className="grid gap-4">
        <Figure
          id="verdict-trend"
          title="Pass rate by day"
          label="Line chart of eval pass rate in percent, 0 to 100, by UTC day, one line per harness. The data table has the same values."
          source={`${source} Y axis runs from 0% to 100%; a gap means no run was judged that day.`}
          table={
            <table className="w-full font-mono text-sm">
              <caption className="mb-1 text-left text-xs text-muted-foreground">Pass rate by UTC day and harness</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>Day</th>
                  <th scope="col" className={th}>Harness</th>
                  <th scope="col" className={`${th} text-right`}>Judged</th>
                  <th scope="col" className={`${th} text-right`}>Pass</th>
                  <th scope="col" className={`${th} text-right`}>Pass rate</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((p) => (
                  <tr key={`${p.day}-${p.harness}`} className="border-t">
                    <td className="px-2 py-1.5 whitespace-nowrap">{p.day}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{p.harness}</td>
                    <td className={td}>{p.judged}</td>
                    <td className={td}>{p.pass}</td>
                    <td className={td}>{pct(p.passRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={wide} margin={{ top: 32, right: 16, bottom: 28, left: 8 }}>
              {keyLayer(harnesses.map((h) => ({ name: h, color: COLOR[h] })))}
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={tick} stroke="var(--border)">
                <Label value="Day (UTC)" position="insideBottom" offset={-16} fill="var(--muted-foreground)" fontSize={12} />
              </XAxis>
              <YAxis tick={tick} stroke="var(--border)" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} width={56}>
                <Label value="Pass rate (%)" angle={-90} position="insideLeft" offset={-2} style={{ textAnchor: "middle" }} fill="var(--muted-foreground)" fontSize={12} />
              </YAxis>
              {harnesses.map((h) => (
                <Line key={h} dataKey={h} name={h} type="monotone" stroke={COLOR[h]} strokeWidth={2} isAnimationActive={false} connectNulls={false} dot={{ r: 3, fill: COLOR[h] }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Figure>
        <Figure
          id="verdict-breakdown"
          title="Verdicts by harness"
          label="Stacked bar chart of run counts by last verdict (pass, conditional, fail, no verdict) for each harness. The data table has the same values."
          source={`${source} Bars count runs.`}
          table={
            <table className="w-full font-mono text-sm">
              <caption className="mb-1 text-left text-xs text-muted-foreground">Runs by last verdict and harness</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>Harness</th>
                  <th scope="col" className={`${th} text-right`}>Pass</th>
                  <th scope="col" className={`${th} text-right`}>Conditional</th>
                  <th scope="col" className={`${th} text-right`}>Fail</th>
                  <th scope="col" className={`${th} text-right`}>No verdict</th>
                  <th scope="col" className={`${th} text-right`}>Pass rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.harness} className="border-t">
                    <th scope="row" className="px-2 py-1.5 text-left font-normal whitespace-nowrap">{r.harness}</th>
                    <td className={td}>{r.pass}</td>
                    <td className={td}>{r.conditional}</td>
                    <td className={td}>{r.fail}</td>
                    <td className={td}>{r.noVerdict}</td>
                    <td className={td}>{pct(r.passRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 32, right: 16, bottom: 28, left: 8 }}>
              {keyLayer(BARS.map((b) => ({ name: b.name, color: b.color })))}
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="harness" tick={tick} stroke="var(--border)">
                <Label value="Harness" position="insideBottom" offset={-16} fill="var(--muted-foreground)" fontSize={12} />
              </XAxis>
              <YAxis tick={tick} stroke="var(--border)" allowDecimals={false} domain={[0, "auto"]} width={56}>
                <Label value="Runs (count)" angle={-90} position="insideLeft" offset={-2} style={{ textAnchor: "middle" }} fill="var(--muted-foreground)" fontSize={12} />
              </YAxis>
              {BARS.map((b) => (
                <Bar key={b.key} dataKey={b.key} name={b.name} stackId="v" fill={b.color} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Figure>
      </div>
    </section>
  );
}
