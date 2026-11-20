import { useMemo, useState } from "react";
import type { Run } from "@/lib/ingest";
import { DASH, formatDuration } from "@/lib/format-duration";
import { sortRuns, toRunRows } from "@/lib/runs-list";
import { RunDetail } from "./run-detail";
import { cn } from "@/lib/utils";
import { runSource } from "@/lib/run-source";

type Filter = "all" | Run["harness"];
const HARNESS_LABEL: Record<Run["harness"], string> = { "claude-code": "Claude Code", codex: "Codex", team: "Team" };
const FILTERS = [["all", "All"], ...Object.entries(HARNESS_LABEL)] as [Filter, string][];
const formatStarted = (iso: string | null) => (iso === null ? DASH : iso.replace("T", " ").replace(/\.\d+Z$/, "Z"));

const th = "px-[var(--density-compact-x)] py-[var(--density-compact-y)] text-left font-medium text-muted-foreground whitespace-nowrap";
const num = "text-right tabular-nums";

export function RunsList({ runs }: { runs: Run[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const sorted = useMemo(() => sortRuns(runs), [runs]);
  const rows = useMemo(() => toRunRows(runs), [runs]);
  const shown = rows.map((row, idx) => ({ row, idx })).filter(({ row }) => (filter === "all" ? row.harness !== "team" : row.harness === filter));

  if (selected !== null && sorted[selected]) {
    return <RunDetail run={sorted[selected]} onBack={() => setSelected(null)} />;
  }

  if (runs.length === 0) {
    return <p role="status" className="text-sm text-muted-foreground">No runs to show.</p>;
  }

  return (
    <section aria-labelledby="runs-heading" data-density="compact">
      <h2 id="runs-heading" className="mb-3 text-lg font-semibold">Runs</h2>
      <div role="group" aria-label="Harness filter" className="mb-3 inline-flex rounded-md border p-0.5">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className="rounded px-3 py-1 text-sm text-muted-foreground aria-pressed:bg-secondary aria-pressed:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">{shown.length} of {rows.length} runs{filter === "all" && <span>, All excludes team runs</span>}</p>
      <p className="mb-2 text-xs text-muted-foreground md:hidden">Scroll for more columns.</p>
      <div tabIndex={0} role="region" aria-label="Runs table, scrollable" className="max-h-[28rem] overflow-auto rounded-md border focus-visible:outline-2 focus-visible:outline-ring">
        <table className="w-full font-mono text-sm">
          <caption className="sr-only">Runs, newest first</caption>
          <thead className="sticky top-0 border-b bg-secondary">
            <tr>
              <th scope="col" className={th}>Run ID</th>
              <th scope="col" className={th}>Harness</th>
              <th scope="col" className={th}>Started (UTC)</th>
              <th scope="col" className={cn(th, num)}>Duration</th>
              <th scope="col" className={cn(th, num)}>Steps</th>
              <th scope="col" className={cn(th, num)}>Tool calls</th>
              <th scope="col" className={cn(th, num)}>Errors</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ row: r, idx }) => (
              <tr key={idx} className="border-t">
                <td className="px-[var(--density-compact-x)] py-[var(--density-compact-y)] whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setSelected(idx)}
                    className="rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {r.id ?? DASH}
                  </button>
                </td>
                <td className="px-[var(--density-compact-x)] py-[var(--density-compact-y)] whitespace-nowrap">{HARNESS_LABEL[r.harness]}</td>
                <td className="px-[var(--density-compact-x)] py-[var(--density-compact-y)] whitespace-nowrap">{formatStarted(r.startedAt)}</td>
                <td className={cn("px-[var(--density-compact-x)] py-[var(--density-compact-y)] whitespace-nowrap", num)}>{formatDuration(r.durationMs)}</td>
                <td className={cn("px-[var(--density-compact-x)] py-[var(--density-compact-y)]", num)}>{r.stepCount}</td>
                <td className={cn("px-[var(--density-compact-x)] py-[var(--density-compact-y)]", num)}>{r.toolCallCount}</td>
                <td className={cn("px-[var(--density-compact-x)] py-[var(--density-compact-y)]", num, r.errorCount > 0 && "text-destructive")}>{r.errorCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-evidence">
        {filter === "team"
          ? `Source: ${runSource("team")}, parsed in the browser.`
          : `Source: ${runSource("claude-code")}, parsed in the browser. Not measured.`}
      </p>
    </section>
  );
}
