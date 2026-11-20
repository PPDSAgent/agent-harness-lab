import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { evidenceChains, type EvidenceChain } from "@/lib/evidence-chain";
import { loadRecords } from "@/lib/run-records";

const W = 640;
const H = 220;
const PAD = { l: 64, r: 16, t: 16, b: 48 };
const NR = "not recorded";
const linkCount = (c: EvidenceChain) => (c.pr ? 1 : 0) + (c.review ? 1 : 0) + (c.brokenCheck ? 1 : 0);
const redText = (c: EvidenceChain) => (c.brokenCheck?.wentRed === true ? "went red" : c.brokenCheck?.wentRed === false ? "did not go red" : NR);

function PrLink({ c }: { c: EvidenceChain }) {
  return c.pr ? (
    <a className="underline underline-offset-2" href={c.pr.url} target="_blank" rel="noreferrer">
      #{c.pr.number}
    </a>
  ) : (
    <>{NR}</>
  );
}
const reviewText = (c: EvidenceChain) => (c.review ? `${c.review.verdict} · ${c.review.path}` : NR);
const checkText = (c: EvidenceChain) => (c.brokenCheck ? `${c.brokenCheck.fileLine} · ${redText(c)}` : NR);

export default function EvidenceTrail({ records }: { records?: unknown[] }) {
  const read = records ?? loadRecords();
  const chains = evidenceChains(read);
  const [sel, setSel] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const chosen = chains.find((c) => c.runId === sel) ?? null;
  const n = chains.length;
  const x = (i: number) => PAD.l + (n <= 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / 3);
  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSel(id);
    }
  };

  return (
    <section tabIndex={-1} aria-label="Evidence trail" className="rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-ring">
      <p className="text-sm text-muted-foreground">One point per team BUILD or FIX run. Height is how many of PR, review verdict and broken check the run recorded. Select a point to see its chain.</p>
      <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: W }} role="group" aria-label="Evidence recorded per run, in time order" className="h-auto">
        {[0, 1, 2, 3].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--muted-foreground)">{v}</text>
          </g>
        ))}
        <text transform={`translate(14 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="var(--muted-foreground)">Links recorded (count, 0 to 3)</text>
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--muted-foreground)">Run, oldest to newest</text>
        {chains.map((c, i) => {
          const id = c.runId!;
          const on = id === sel;
          const color = c.mode === "FIX" ? "var(--chart-2)" : "var(--chart-1)";
          return (
            <g
              key={id}
              role="button"
              tabIndex={0}
              aria-label={`${id} ${c.taskId ?? "no task"} ${c.mode}`}
              aria-pressed={on}
              onClick={() => setSel(id)}
              onKeyDown={onKey(id)}
              className="cursor-pointer outline-none [&:focus-visible>circle:last-child]:stroke-[var(--ring)] [&:focus-visible>circle:last-child]:stroke-[3]"
            >
              <circle cx={x(i)} cy={y(linkCount(c))} r={14} fill="transparent" />
              {c.mode === "FIX" ? (
                <rect x={x(i) - 5} y={y(linkCount(c)) - 5} width={10} height={10} fill={color} transform={`rotate(45 ${x(i)} ${y(linkCount(c))})`} />
              ) : null}
              {on ? <circle data-selected="true" cx={x(i)} cy={y(linkCount(c))} r={11} fill="none" stroke="var(--foreground)" strokeWidth={3} /> : null}
              <circle cx={x(i)} cy={y(linkCount(c))} r={c.mode === "FIX" ? 8 : 5} fill={c.mode === "FIX" ? "none" : color} stroke="none" />
            </g>
          );
        })}
      </svg>
      </div>
      <p className="text-xs text-muted-foreground">Circle: BUILD. Diamond: FIX.</p>
      <Button variant="secondary" size="sm" className="mt-3 focus-visible:ring-ring" aria-expanded={table} onClick={() => setTable((v) => !v)}>
        {table ? "Hide data table" : "Show data table"}
      </Button>
      {chosen && (
        <section aria-label="Evidence chain" className="mt-4 rounded-md border p-3 text-sm">
          <ol className="space-y-1">
            <li><span className="font-semibold">Run</span>: {chosen.runId}, {chosen.taskId ?? NR}, {chosen.mode}{" "}</li>
            <li><span className="font-semibold">PR</span>: <PrLink c={chosen} />{" "}</li>
            <li><span className="font-semibold">Review verdict</span>: {reviewText(chosen)}{" "}</li>
            <li><span className="font-semibold">Broken check</span>: {checkText(chosen)}{" "}</li>
          </ol>
        </section>
      )}
      {table && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Evidence chain for every team BUILD and FIX run</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-4 font-normal">Run</th>
                <th className="py-1 pr-4 font-normal">PR</th>
                <th className="py-1 pr-4 font-normal">Review verdict</th>
                <th className="py-1 font-normal">Broken check</th>
              </tr>
            </thead>
            <tbody>
              {chains.map((c) => (
                <tr key={c.runId} className="border-t align-top">
                  <td className="py-1 pr-4 font-mono">{c.runId} {c.taskId ?? NR} {c.mode}</td>
                  <td className="py-1 pr-4"><PrLink c={c} /></td>
                  <td className="py-1 pr-4 font-mono">{reviewText(c)}</td>
                  <td className="py-1 font-mono">{checkText(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Source: the team's own run records (runs/*.json), {read.length} records read, {n} BUILD or FIX.</p>
    </section>
  );
}
