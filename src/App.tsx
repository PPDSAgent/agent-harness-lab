import { lazy, Suspense, useState } from "react";
import { CartesianGrid, Label, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { RunsList } from "@/components/runs-list";
import { UsageCharts } from "@/components/usage-charts";
import StyleGuide from "@/pages/styleguide";
import { generatedAt, placeholderSeries } from "@/data/placeholder";
import { DataState } from "@/components/data-state";
import { useAppData } from "@/lib/use-app-data";

const tick = { fill: "var(--muted-foreground)", fontSize: 12 };
// B1: run data lives in its own chunk so the entry stays the same size as runs/*.json grows.
// The shell (heading, theme toggle, placeholder chart, section buttons) renders without it;
// useAppData loads the chunk after the entry runs and the data sections render when it arrives.
const SkillUsageCharts = lazy(() => import("@/components/skill-usage-charts"));
const VerdictCharts = lazy(() => import("@/components/verdict-charts"));
const ClaimsAudit = lazy(() => import("./components/claims-audit"));
const P1Questions = lazy(() => import("./components/p1-questions"));
const HarnessComparison = lazy(() => import("./components/harness-comparison"));
const TrailLink = lazy(() => import("./components/trail"));
const EvidenceTrail = lazy(() => import("./components/evidence-trail"));
const last = placeholderSeries.length - 1;

function Home() {
  const [showTable, setShowTable] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showEval, setShowEval] = useState(false);
  const [showClaims, setShowClaims] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showTrail, setShowTrail] = useState(false);
  const trailLink = <TrailLink open={setShowTrail} />;
  const data = useAppData();
  const loaded = data.status === "ready" ? data.data : null;
  const pending = data.status === "ready" ? null : <DataState status={data.status} retry={data.retry} />;
  // One failure, one alert: the Runs area owns the error and its retry; open sections get a quiet note.
  const sectionPending = data.status === "error" ? (
    <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
      Run data unavailable. See the message under Runs.
    </p>
  ) : pending;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10" data-density="compact" data-view-enter>
      <div className="mb-4 flex justify-end">
        <ThemeToggle />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-lg font-semibold">Request latency, p50 (placeholder)</h1>
          </CardTitle>
          <CardDescription>Skeleton page: one chart from a typed in-memory array.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full" role="img" aria-label="Line chart of synthetic p50 latency in milliseconds by day">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={placeholderSeries} margin={{ top: 16, right: 56, bottom: 24, left: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={tick} stroke="var(--border)">
                  <Label value="Day (synthetic window)" position="insideBottom" offset={-16} fill="var(--muted-foreground)" fontSize={12} />
                </XAxis>
                <YAxis tick={tick} stroke="var(--border)" domain={[0, "auto"]} width={52}>
                  <Label value="Latency (ms)" angle={-90} position="insideLeft" offset={4} style={{ textAnchor: "middle" }} fill="var(--muted-foreground)" fontSize={12} />
                </YAxis>
                <Line
                  dataKey="p50Ms"
                  name="p50"
                  type="monotone"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "var(--chart-1)" }}
                  label={({ index, x, y }) =>
                    index === last ? (
                      <text key="p50-label" x={Number(x) + 8} y={Number(y) + 4} fill="var(--chart-1)" fontSize={12} fontWeight={600}>
                        p50
                      </text>
                    ) : (
                      <g key={`l-${index}`} />
                    )
                  }
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Button variant="secondary" size="sm" className="mt-4 focus-visible:ring-ring" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Hide data table" : "Show data table"}
          </Button>
          {showTable && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full font-mono text-sm">
                <caption className="sr-only">Placeholder p50 latency data</caption>
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-4 font-normal">Day</th>
                    <th className="py-1 font-normal">p50 (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {placeholderSeries.map((p) => (
                    <tr key={p.day} className="border-t">
                      <td className="py-1 pr-4">{p.day}</td>
                      <td className="py-1">{p.p50Ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-xs text-evidence">
          Source: SYNTHETIC in-memory placeholder data (src/data/placeholder.ts), days 0-7, generated {generatedAt} (date the static array was authored). Not measured.
        </CardFooter>
      </Card>
      <div className="mt-8">
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading the three questions…</p>}>
          {loaded ? (
            <P1Questions runs={loaded.allRuns} />
          ) : (
            // Quiet note, no role: the Runs area owns the single loading status and the single alert.
            <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
              {data.status === "error"
                ? "Run data unavailable. See the message under Runs."
                : "The three questions appear when the run data arrives."}
            </p>
          )}
        </Suspense>
      </div>
      <div className="mt-8">
        <Button variant="secondary" size="sm" className="focus-visible:ring-ring" aria-expanded={showUsage} onClick={() => setShowUsage((v) => !v)}>
          Cost, tokens and latency
        </Button>
        {showUsage && (
          <div className="mt-4">
            {loaded === null ? sectionPending : (
              <>
                <UsageCharts rows={loaded.usageRows} />
                <div className="mt-8">
                  <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading skill view…</p>}>
                    {trailLink}
                    <SkillUsageCharts runs={loaded.allRuns} />
                  </Suspense>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          <Button variant="secondary" size="sm" className="focus-visible:ring-ring" aria-expanded={showEval} onClick={() => setShowEval((v) => !v)}>
            Eval pass rate
          </Button>
        </h2>
        {showEval && (
          <div className="mt-4">
            {loaded === null ? sectionPending : (
              <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading eval view…</p>}>
                {trailLink}
                <VerdictCharts runs={loaded.allRuns} heading={false} />
              </Suspense>
            )}
          </div>
        )}
      </div>
      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          <Button variant="secondary" size="sm" className="focus-visible:ring-ring" aria-expanded={showClaims} onClick={() => setShowClaims((v) => !v)}>
            Unsupported claims
          </Button>
        </h2>
        {showClaims && (
          <div className="mt-4">
            {loaded === null ? sectionPending : (
              <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading claims view…</p>}>
                <ClaimsAudit runs={loaded.allRuns} />
              </Suspense>
            )}
          </div>
        )}
      </div>
      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          <Button variant="secondary" size="sm" className="focus-visible:ring-ring" aria-expanded={showCompare} onClick={() => setShowCompare((v) => !v)}>
            Compare harnesses
          </Button>
        </h2>
        {showCompare && (
          <div className="mt-4">
            {loaded === null ? sectionPending : (
              <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading comparison…</p>}>
                <HarnessComparison runs={loaded.allRuns} />
              </Suspense>
            )}
          </div>
        )}
      </div>
      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          <Button variant="secondary" size="sm" className="focus-visible:ring-ring" aria-expanded={showTrail} onClick={() => setShowTrail((v) => !v)}>
            Evidence trail
          </Button>
        </h2>
        {showTrail && (
          <div className="mt-4">
            <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading evidence trail…</p>}>
              <EvidenceTrail />
            </Suspense>
          </div>
        )}
      </div>
      <div className="mt-8">
        {loaded !== null ? (
          <RunsList runs={loaded.allRuns} />
        ) : (
          <section aria-labelledby="runs-heading">
            <h2 id="runs-heading" className="mb-3 text-lg font-semibold">Runs</h2>
            {pending}
          </section>
        )}
      </div>
    </main>
  );
}

/** Path routing without a router library: two routes. /styleguide is imported statically: the frozen component test renders it synchronously, and the page is small (no chart library). */
export default function App() {
  if (window.location.pathname.replace(/\/+$/, "") === "/styleguide") {
    return <StyleGuide />;
  }
  return <Home />;
}
