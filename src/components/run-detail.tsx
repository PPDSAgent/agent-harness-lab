import { lazy, Suspense, useEffect, useRef } from "react";
import type { Run } from "@/lib/ingest";
import { DASH, formatDuration } from "@/lib/format-duration";
import { cn } from "@/lib/utils";
import { runSource } from "@/lib/run-source";

const RunSwimlane = lazy(() => import("./run-body"));

const focusRing = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

export function RunDetail({ run, onBack }: { run: Run; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <section aria-labelledby="run-detail-heading">
      <button type="button" onClick={onBack} className={cn("mb-3 rounded border px-3 py-1 text-sm", focusRing)}>
        ← Back to runs
      </button>
      <h2 id="run-detail-heading" ref={heading} tabIndex={-1} className="mb-1 font-mono text-lg font-semibold focus:outline-none">
        Run {run.id ?? DASH}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {run.steps.length} steps · {run.toolCalls.length} tool calls · duration {formatDuration(run.durationMs)}
      </p>
      <Suspense fallback={<p role="status" className="mb-4 text-sm text-muted-foreground">Loading swimlane…</p>}>
        <RunSwimlane run={run} />
      </Suspense>
      {run.steps.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">This run has no steps.</p>
      ) : (
        <ol className="space-y-3 font-mono text-sm" aria-label="Step timeline">
          {run.steps.map((s, i) => (
            <li key={`${s.index}-${i}`} className="rounded-md border p-3">
              <div className="flex gap-3">
                <span className="text-muted-foreground tabular-nums">#{s.index}</span>
                <span className="text-muted-foreground">{s.timestamp ?? DASH}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{s.text ?? DASH}</p>
              {s.toolCalls.length > 0 && (
                <ul className="mt-2 space-y-1" aria-label={`Tool calls in step ${s.index}`}>
                  {s.toolCalls.map((c, j) => (
                    <li key={j} className="flex flex-wrap items-baseline gap-x-3 border-l-2 pl-2">
                      <span>{c.name ?? DASH}</span>
                      <span className="tabular-nums text-muted-foreground">{formatDuration(c.durationMs)}</span>
                      {c.isError === true && <span className="font-medium text-destructive">error</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Source: {runSource(run.harness)}, parsed in the browser. Durations in ms, formatted.{run.harness === "team" ? "" : " Not measured."}
      </p>
    </section>
  );
}
