import { useId } from "react";
import { DASH } from "@/lib/format-duration";
import { answerP1Questions, type Provenance } from "@/lib/p1-questions";
import type { Run } from "@/lib/ingest";

// HL-016: the three P1 questions answered in plain text, each with its source line (DESIGN.md principle 4).
// Loaded lazily from App so the entry chunk does not grow (HL-011a budget). Skill names come from logs and are
// untrusted: they are rendered only as React text children, never as HTML.

const pct = (r: number | null) => (r === null ? DASH : `${(r * 100).toFixed(1)}%`);
const usd = (v: number | null) => (v === null ? "unknown" : `$${v.toFixed(2)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const NOT_ANSWERABLE = "Not answerable from these sources: no data.";

function Source({ p, what }: { p: Provenance; what: string }) {
  return (
    <div className="mt-2 text-xs text-evidence">
      <p className="break-words">Source: {p.sources.length === 0 ? "none" : p.sources.join(", ")}; n = {what}.</p>
      {p.runIds.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer py-1">Run ids ({p.runIds.length})</summary>
          <p className="break-words font-mono">{p.runIds.join(", ")}</p>
        </details>
      )}
    </div>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-lg border bg-card p-4">
      <p id={id} className="text-sm font-semibold">{title}</p>
      {children}
    </section>
  );
}

export default function P1Questions({ runs }: { runs: readonly Run[] }) {
  const { skillFailures: q1, runCost: q2, unsupportedClaims: q3 } = answerP1Questions(runs);
  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold">The three questions</h2>
      <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-3">
        <Question title="Which skill fails most often?">
          {q1.status === "no-data" ? (
            <p className="mt-2 text-sm">{NOT_ANSWERABLE} No skill invocations were recorded.</p>
          ) : q1.status === "no-failures" ? (
            <p className="mt-2 text-sm">No skill failed in {plural(q1.provenance.n, "recorded invocation")}.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {q1.top.map((r) => (
                <li key={r.skill} className="break-words">
                  <span className="font-mono">{r.skill}</span>: {r.failures} of its {plural(r.invocations, "invocation")} failed
                  {r.unknown > 0 ? `, ${plural(r.unknown, "outcome")} unknown` : ""} ({pct(r.failureRate)} of those with a known outcome).
                </li>
              ))}
            </ul>
          )}
          <Source
            p={q1.provenance}
            what={`${plural(q1.provenance.n, "skill invocation")}, from ${plural(q1.ranking.length, "skill")} in ${plural(q1.provenance.runIds.length, "run")}`}
          />
        </Question>
        <Question title="What does each scheduled run cost?">
          {q2.status === "no-data" ? (
            <p className="mt-2 text-sm">{NOT_ANSWERABLE} No scheduled-run records were found.</p>
          ) : (
            <p className="mt-2 text-sm">
              {q2.knownCost === 0
                ? `Cost not recorded for any of the ${plural(q2.runs, "scheduled run")}. Mean cost: ${usd(null)}.`
                : `${plural(q2.runs, "scheduled run")}; mean cost per run ${usd(q2.meanUsd)} over ${plural(q2.knownCost, "run")} with a known cost. ${q2.unknownCost} unknown (cost not recorded).`}
            </p>
          )}
          <Source p={q2.provenance} what={plural(q2.provenance.n, "scheduled run")} />
        </Question>
        <Question title="Which claims lack evidence?">
          {q3.status === "no-data" ? (
            <p className="mt-2 text-sm">{NOT_ANSWERABLE} No claims were recorded.</p>
          ) : (
            <p className="mt-2 text-sm">
              {q3.unsupported} of {plural(q3.claims, "claim")} carry no evidence marker ({pct(q3.unsupportedRate)}).
            </p>
          )}
          <Source p={q3.provenance} what={plural(q3.provenance.n, "claim")} />
        </Question>
      </div>
    </div>
  );
}
