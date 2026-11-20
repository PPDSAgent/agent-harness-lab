import { lazy, Suspense } from "react";
import type { Run } from "@/lib/ingest";
import RunEvidence from "./run-evidence";

const RunSwimlane = lazy(() => import("./run-swimlane"));

// One lazy chunk for the run detail's chart-side blocks, so the entry gains no second dynamic import (HL-021b B2/B5):
// the Evidence chain block (and the raw run records behind it) for team runs, then the swimlane in its own chunk.
export default function RunVisuals({ run }: { run: Run }) {
  return (
    <>
      {run.harness === "team" && <RunEvidence run={run} />}
      <Suspense fallback={<p role="status" className="mb-4 text-sm text-muted-foreground">Loading swimlane…</p>}>
        <RunSwimlane run={run} />
      </Suspense>
    </>
  );
}
