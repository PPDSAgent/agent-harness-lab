// @vitest-environment node
// FROZEN acceptance tests for HL-021a A1 and A2 (pure evidence-chain library). Builder may not edit this file.
// Inline data is SYNTHETIC. A2 reads the team's own committed runs/*.json (non-sensitive) from disk, as tests/hl-008.run-records.test.ts does.
//
// CONTRACT, imported from `src/lib/evidence-chain.ts`:
//   evidenceChain(record: unknown): EvidenceChain
//   evidenceChains(records: readonly unknown[]): EvidenceChain[]
//   EvidenceChain = { runId: string|null, taskId: string|null, mode: string|null,
//                     pr: { number: number, url: string } | null,
//                     review: { verdict: "PASS"|"CONDITIONAL"|"FAIL", path: string } | null,
//                     brokenCheck: { fileLine: string, wentRed: boolean|null } | null }
//   Source fields (runs/SCHEMA.md): run_date + slot -> runId `${run_date}T${slot}`; task_id; mode; pr_number -> pr
//   (url https://github.com/PPDSAgent/harness-lab/pull/<n>); review.{verdict,path} -> review; mutation_check.{file_line,went_red}
//   -> brokenCheck. Absent/null source -> null (never 0, "" or a guess). Malformed input never throws.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evidenceChain, evidenceChains } from "../src/lib/evidence-chain";

const RUNS_DIR = resolve(__dirname, "..", "runs");
const files = readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json")).sort();
const committed = files.map((f) => ({ stem: f.replace(/\.json$/, ""), rec: JSON.parse(readFileSync(join(RUNS_DIR, f), "utf8")) as Record<string, unknown> }));

// SYNTHETIC full record.
const FULL = {
  schema_version: 3, run_date: "2026-01-02", slot: "0900", mode: "BUILD", task_id: "HL-900", pr_number: 77,
  review: { verdict: "CONDITIONAL", path: "reviews/2026-01-02T0900-HL-900-r2.md", fix_pass_used: true, unflagged_claims: 0 },
  mutation_check: { file_line: "src/lib/x.ts:42", went_red: true },
};
const without = (o: Record<string, unknown>, k: string) => Object.fromEntries(Object.entries(o).filter(([key]) => key !== k));
const EMPTY_LINKS = { pr: null, review: null, brokenCheck: null };

describe("HL-021a A1: evidenceChain maps one raw run record", () => {
  it("maps every field of a complete record", () => {
    expect(evidenceChain(FULL)).toEqual({
      runId: "2026-01-02T0900", taskId: "HL-900", mode: "BUILD",
      pr: { number: 77, url: "https://github.com/PPDSAgent/harness-lab/pull/77" },
      review: { verdict: "CONDITIONAL", path: "reviews/2026-01-02T0900-HL-900-r2.md" },
      brokenCheck: { fileLine: "src/lib/x.ts:42", wentRed: true },
    });
  });
  it("keeps went_red=false as false (not null)", () => {
    const c = evidenceChain({ ...FULL, mutation_check: { file_line: "src/a.ts:1", went_red: false } });
    expect(c.brokenCheck).toEqual({ fileLine: "src/a.ts:1", wentRed: false });
  });
  it("pr_number null or absent gives pr null", () => {
    expect(evidenceChain({ ...FULL, pr_number: null }).pr).toBeNull();
    expect(evidenceChain(without(FULL, "pr_number")).pr).toBeNull();
  });
  it("review null or absent gives review null", () => {
    expect(evidenceChain({ ...FULL, review: null }).review).toBeNull();
    expect(evidenceChain(without(FULL, "review")).review).toBeNull();
  });
  it("a review with no recognised verdict gives review null (no guessed verdict)", () => {
    expect(evidenceChain({ ...FULL, review: { verdict: null, path: "reviews/x.md" } }).review).toBeNull();
    expect(evidenceChain({ ...FULL, review: { verdict: "MAYBE", path: "reviews/x.md" } }).review).toBeNull();
  });
  it("mutation_check null, absent, or with no file_line gives brokenCheck null", () => {
    expect(evidenceChain({ ...FULL, mutation_check: null }).brokenCheck).toBeNull();
    expect(evidenceChain(without(FULL, "mutation_check")).brokenCheck).toBeNull();
    expect(evidenceChain({ ...FULL, mutation_check: { file_line: null, went_red: true } }).brokenCheck).toBeNull();
  });
  it("a mutation_check with file_line but no went_red keeps wentRed null (not false)", () => {
    expect(evidenceChain({ ...FULL, mutation_check: { file_line: "src/a.ts:9" } }).brokenCheck).toEqual({ fileLine: "src/a.ts:9", wentRed: null });
  });
  it("null task_id stays null (not empty string)", () => {
    expect(evidenceChain({ ...FULL, task_id: null }).taskId).toBeNull();
  });
  it("is pure: does not mutate its input and returns equal output twice", () => {
    const input = JSON.parse(JSON.stringify(FULL));
    const a = evidenceChain(input);
    expect(input).toEqual(FULL);
    expect(evidenceChain(input)).toEqual(a);
  });
  it.each([
    ["null", null], ["undefined", undefined], ["number", 42], ["string", "x"], ["array", []], ["empty object", {}],
    ["wrong types", { run_date: 5, slot: {}, mode: [], task_id: 3, pr_number: "7", review: "PASS", mutation_check: 9 }],
    ["deep nulls", { run_date: "2026-01-02", slot: "0900", review: { verdict: {}, path: 4 }, mutation_check: { file_line: 5 } }],
  ])("a malformed record (%s) never throws and yields null links", (_n, bad) => {
    let c: ReturnType<typeof evidenceChain> | undefined;
    expect(() => { c = evidenceChain(bad); }).not.toThrow();
    expect(c).toMatchObject(EMPTY_LINKS);
    for (const k of ["runId", "taskId", "mode"] as const) {
      const v = c![k];
      expect(v === null || (typeof v === "string" && !/undefined|NaN|null/.test(v)), `${k}=${String(v)}`).toBe(true);
    }
  });
  it("a non-integer or non-positive pr_number is not turned into a PR link", () => {
    for (const bad of [0, -3, 1.5, "7", NaN]) expect(evidenceChain({ ...FULL, pr_number: bad }).pr, String(bad)).toBeNull();
  });
});

describe("HL-021a A2: evidenceChains keeps BUILD and FIX runs in chronological order", () => {
  const mk = (run_date: string, slot: string, mode: string, task_id: string | null) => ({ ...FULL, run_date, slot, mode, task_id });
  it("drops WAIT, SECURITY, unknown-mode and non-object entries", () => {
    const out = evidenceChains([mk("2026-01-02", "0900", "WAIT", null), mk("2026-01-02", "1000", "BUILD", "HL-1"), mk("2026-01-02", "1100", "SECURITY", null), mk("2026-01-02", "1200", "FIX", "HL-1"), null, 7, "x", {}, mk("2026-01-02", "1300", "bogus", "HL-2")]);
    expect(out.map((c) => c.runId)).toEqual(["2026-01-02T1000", "2026-01-02T1200"]);
    expect(out.map((c) => c.mode)).toEqual(["BUILD", "FIX"]);
  });
  it("sorts by run_date then slot regardless of input order", () => {
    const recs = [mk("2026-01-03", "0100", "BUILD", "HL-3"), mk("2026-01-02", "1830", "FIX", "HL-2"), mk("2026-01-02", "0930", "BUILD", "HL-1"), mk("2026-01-01", "2359", "BUILD", "HL-0")];
    expect(evidenceChains(recs).map((c) => c.runId)).toEqual(["2026-01-01T2359", "2026-01-02T0930", "2026-01-02T1830", "2026-01-03T0100"]);
  });
  it("returns [] for an empty list and does not mutate the input array", () => {
    expect(evidenceChains([])).toEqual([]);
    const recs = [mk("2026-01-03", "0100", "BUILD", "HL-3"), mk("2026-01-02", "0930", "BUILD", "HL-1")];
    const copy = [...recs];
    evidenceChains(recs);
    expect(recs).toEqual(copy);
  });
  it("every committed runs/*.json of mode BUILD or FIX produces exactly one chain, in chronological order", () => {
    const expected = committed.filter((c) => c.rec.mode === "BUILD" || c.rec.mode === "FIX");
    expect(expected.length).toBeGreaterThan(5);
    const out = evidenceChains(committed.map((c) => c.rec));
    expect(out.map((c) => c.runId)).toEqual(expected.map((c) => c.stem).sort());
    expect(new Set(out.map((c) => c.runId)).size).toBe(out.length);
  });
  it("each real chain equals evidenceChain of its record, and real nulls stay null", () => {
    const out = evidenceChains(committed.map((c) => c.rec));
    for (const ch of out) {
      const src = committed.find((c) => c.stem === ch.runId)!;
      expect(ch).toEqual(evidenceChain(src.rec));
      expect(ch.pr === null, ch.runId).toBe(src.rec.pr_number == null);
      if (ch.pr) expect(ch.pr.url).toBe(`https://github.com/PPDSAgent/harness-lab/pull/${String(src.rec.pr_number)}`);
      expect(ch.review === null, ch.runId).toBe(!(src.rec.review as { verdict?: unknown } | null)?.verdict);
    }
    expect(out.some((c) => c.pr === null)).toBe(true);
    expect(out.some((c) => c.pr !== null)).toBe(true);
  });
});
