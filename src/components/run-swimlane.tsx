import { useEffect, useId, useRef, useState } from "react";
import { scaleBand, scaleLinear } from "d3-scale";
import type { Run } from "@/lib/ingest";
import { DASH, formatDuration } from "@/lib/format-duration";
import { buildScrubSteps, clampStep } from "@/lib/scrubber";
import { buildSwimlane } from "@/lib/swimlane";
import { cn } from "@/lib/utils";
import { runSource } from "@/lib/run-source";

const focusRing = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";
const LABEL_W = 96;
const PAD_R = 12;
const ROW_H = 28;
const TOP = 6;
const AXIS_H = 38;
const PLOT_W = 560; // chart units; the svg scales to the container via viewBox
const MIN_BAR = 2;

/** Lane rows over time. Scales from d3-scale; React renders the SVG. Data: the run's parsed tool calls (SYNTHETIC fixtures or the team's run records, see runSource). */
export default function RunSwimlane({ run }: { run: Run }) {
  const { lanes, bars, spanMs, unplaced } = buildSwimlane(run);
  const [showTable, setShowTable] = useState(false);
  const [rawPos, setPos] = useState(0);
  const tableId = useId();
  const regionRef = useRef<HTMLDivElement>(null);
  const patternId = useId();
  const placed = bars.filter((b) => b.startMs !== null);
  const steps = buildScrubSteps({ lanes, bars, spanMs, unplaced });
  const cur = clampStep(rawPos, steps.length);
  const curStep = cur === null ? null : steps[cur];
  const go = (p: number) => setPos(clampStep(p, steps.length) ?? 0);
  const readout = curStep === null ? "" : `Step ${curStep.position + 1} of ${steps.length}: ${curStep.name ?? "unknown"}, ${formatDuration(curStep.durationMs)}, ${curStep.isError ? "error" : "ok"}`;
  const stepBtn = "inline-flex h-8 min-w-8 items-center justify-center rounded border px-3 text-sm disabled:opacity-50";
  // Keep the current bar inside the scroll region (390 px: the chart is wider than the region). Instant under prefers-reduced-motion.
  useEffect(() => {
    const region = regionRef.current;
    const rect = region?.querySelector('rect[aria-current="step"]');
    if (!region || !rect) return;
    const rb = region.getBoundingClientRect();
    const cb = rect.getBoundingClientRect();
    const margin = 24;
    let delta = 0;
    if (cb.left < rb.left + margin) delta = cb.left - rb.left - margin;
    else if (cb.left > rb.right - margin) delta = cb.left - rb.right + margin;
    if (delta === 0) return;
    const left = region.scrollLeft + delta;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof region.scrollTo !== "function") region.scrollLeft = left;
    else region.scrollTo({ left, behavior: "smooth" });
  }, [cur]);
  const fmtStart = (ms: number | null) => (ms === null ? DASH : ms < 0 ? `${formatDuration(-ms)} before run start` : formatDuration(ms));

  const height = TOP + lanes.length * ROW_H + AXIS_H;
  const minStart = Math.min(0, ...placed.map((b) => b.startMs as number));
  const x = scaleLinear().domain([minStart, Math.max(spanMs ?? 0, 1)]).range([LABEL_W, LABEL_W + PLOT_W]);
  const y = scaleBand<string>().domain(lanes).range([TOP, TOP + lanes.length * ROW_H]).padding(0.25);
  const ticks = x.ticks(5).filter((t) => t >= 0);
  const VB_W = LABEL_W + PLOT_W + PAD_R;

  return (
    <figure aria-label="Run swimlane" className="mb-4">
      <figcaption className="mb-1 text-sm font-medium">Tool calls over time</figcaption>
      {placed.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">No timed tool calls in this run.</p>
      ) : (
        <div ref={regionRef} tabIndex={0} role="region" aria-label="Swimlane chart, scrollable" className="overflow-x-auto rounded-md border focus-visible:outline-2 focus-visible:outline-ring">
          <svg viewBox={`0 0 ${VB_W} ${height}`} width="100%" style={{ minWidth: VB_W }} role="img" aria-label="Tool calls by lane against time since run start" className="font-mono text-[11px]">
            <defs>
              <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M0 0H6V6H0Z" fill="var(--destructive)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--background)" strokeWidth="2" />
              </pattern>
            </defs>
            {lanes.map((l) => (
              <g key={l}>
                <line x1={LABEL_W} x2={LABEL_W + PLOT_W} y1={(y(l) ?? 0) + y.bandwidth() / 2} y2={(y(l) ?? 0) + y.bandwidth() / 2} stroke="var(--border)" />
                <text x={LABEL_W - 6} y={(y(l) ?? 0) + y.bandwidth() / 2} textAnchor="end" dominantBaseline="middle" fill="currentColor">{l}</text>
              </g>
            ))}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={TOP} y2={TOP + lanes.length * ROW_H} stroke="var(--border)" strokeDasharray="2 3" />
                <text x={x(t)} y={TOP + lanes.length * ROW_H + 14} textAnchor="middle" fill="var(--muted-foreground)">{formatDuration(t)}</text>
              </g>
            ))}
            <text x={LABEL_W + PLOT_W / 2} y={TOP + lanes.length * ROW_H + 32} textAnchor="middle" fill="var(--muted-foreground)">Time since run start</text>
            {placed.map((b, i) => (
              <rect
                key={i}
                x={x(b.startMs as number)}
                y={y(b.lane)}
                width={Math.max(MIN_BAR, x(b.durationMs ?? 0) - x(0))}
                height={y.bandwidth()}
                rx={2}
                fill={b.isError ? `url(#${patternId})` : "var(--chart-1)"}
                stroke={b.isError ? "var(--destructive)" : "none"}
                strokeWidth={b.isError ? 1.5 : 0}
                aria-current={i === cur ? "step" : undefined}
              >
                <title>
                  {`${b.lane}, step ${b.stepIndex}, start ${fmtStart(b.startMs)}, duration ${formatDuration(b.durationMs)}${b.isError ? ", error" : ""}`}
                </title>
              </rect>
            ))}
            {curStep !== null && cur !== null && (() => {
              const b = placed[cur];
              const cx = x(b.startMs as number);
              const top = (y(b.lane) ?? 0) - 1;
              const w = Math.max(MIN_BAR, x(b.durationMs ?? 0) - x(0));
              const x0 = cx - 3;
              const y0 = (y(b.lane) ?? 0) - 3;
              const ring = `M${x0} ${y0}h${w + 6}v${y.bandwidth() + 6}h${-(w + 6)}z`;
              return (
                <>
                  <path data-current-highlight="true" d={ring} fill="none" stroke="currentColor" strokeWidth={2} pointerEvents="none" />
                  <polygon points={`${cx - 4},${top - 5} ${cx + 4},${top - 5} ${cx},${top}`} fill="currentColor" />
                </>
              );
            })()}
          </svg>
        </div>
      )}
      {curStep !== null && (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" className={cn(stepBtn, focusRing)} disabled={cur === 0} onClick={() => go((cur ?? 0) - 1)}>Previous step</button>
          <input
            type="range"
            aria-label="Scrub tool calls"
            min={0}
            max={steps.length - 1}
            step={1}
            value={cur ?? 0}
            onChange={(e) => go(Number(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Home") { e.preventDefault(); go(0); }
              else if (e.key === "End") { e.preventDefault(); go(steps.length - 1); }
            }}
            className={cn("h-8 min-w-0 flex-1", focusRing)}
          />
          <button type="button" className={cn(stepBtn, focusRing)} disabled={cur === steps.length - 1} onClick={() => go((cur ?? 0) + 1)}>Next step</button>
        </div>
      )}
      {curStep !== null && <p role="status" className="mt-1 text-sm tabular-nums">{readout}</p>}
      {unplaced > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {unplaced === 1 ? "1 tool call without a start time is not drawn." : `${unplaced} tool calls without a start time are not drawn.`}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">Time since run start; tick labels carry their own units. Hatched bars with a red outline are errors. Source: {runSource(run.harness)}, parsed in the browser.</p>
      {bars.length > 0 && (
        <div className="mt-2">
          <button type="button" aria-expanded={showTable} aria-controls={tableId} onClick={() => setShowTable((v) => !v)} className={cn("rounded border px-3 py-1 text-sm", focusRing)}>
            {showTable ? "Hide data table" : "Show data table"}
          </button>
          {showTable && (
            <div id={tableId} tabIndex={0} role="region" aria-label="Swimlane data table, scrollable" className="mt-2 max-h-72 overflow-auto rounded-md border focus-visible:outline-2 focus-visible:outline-ring">
              <table className="w-full font-mono text-xs">
                <thead className="sticky top-0 border-b bg-secondary">
                  <tr>
                    {["Lane", "Step", "Start", "Duration", "Error"].map((h) => (
                      <th key={h} scope="col" className="px-2 py-1 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bars.map((b, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1">{b.lane}</td>
                      <td className="px-2 py-1 tabular-nums">{b.stepIndex}</td>
                      <td className="px-2 py-1 tabular-nums">{" "}{fmtStart(b.startMs)}</td>
                      <td className="px-2 py-1 tabular-nums">{formatDuration(b.durationMs)}</td>
                      <td className="px-2 py-1">{b.isError ? "error" : "no"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
