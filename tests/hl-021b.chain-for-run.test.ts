// @vitest-environment node
// FROZEN acceptance test for HL-021b B1 (pure lookup). Builder may not edit this file. All inline data is SYNTHETIC.
// CONTRACT (chosen by the test engineer, the only module path fixed for HL-021b): src/lib/evidence-chain.ts exports
//   chainForRun(run: Run, records: readonly unknown[]): EvidenceChain | null
// B1: for a team Run (harness "team") with a non-null id, returns the same value evidenceChain(record) gives for the record whose
// `${run_date}T${slot}` equals run.id. A claude-code or codex run, a team run with a null id, or no matching record gives null.
// Malformed records (null, strings, numbers, arrays, objects with wrong field types) never throw.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as chainModule from "../src/lib/evidence-chain";
import { evidenceChain } from "../src/lib/evidence-chain";
import { parseRunRecord } from "../src/lib/ingest";
import { loadFixtureRuns } from "../src/lib/load-fixture-runs";

const chainForRun = (chainModule as unknown as { chainForRun: (run: unknown, records: readonly unknown[]) => unknown }).chainForRun;

const rec = (run_date: string, slot: string, mode: string, o: Record<string, unknown> = {}) => ({
  schema_version: 3, run_date, slot, mode, task_id: "HL-901", pr_number: null, review: null, mutation_check: null, ...o,
});
const A = rec("2026-02-03", "0900", "BUILD", {
  pr_number: 41,
  review: { verdict: "CONDITIONAL", path: "reviews/2026-02-03T0900-HL-901-r2.md" },
  mutation_check: { file_line: "src/lib/alpha.ts:17", went_red: true },
});
const B = rec("2026-02-03", "1500", "FIX", { pr_number: 41, review: { verdict: "PASS", path: "reviews/2026-02-03T1500-HL-901-r3.md" }, mutation_check: { file_line: "src/lib/beta.ts:5", went_red: false } });
const WAIT = rec("2026-02-03", "1200", "WAIT", { task_id: null });
const JUNK: unknown[] = [null, "junk", 7, [], [A], { run_date: 5, slot: {} }, { run_date: "2026-02-03" }, { review: "x", mutation_check: 3 }];
const teamRun = (r: unknown) => parseRunRecord(JSON.stringify(r));

describe("HL-021b B1: chainForRun is exported", () => {
  it("src/lib/evidence-chain.ts exports a function chainForRun", () => {
    expect(typeof chainForRun).toBe("function");
  });
});

describe("HL-021b B1: team runs resolve to the matching record's chain", () => {
  it("returns exactly evidenceChain(record) for the record whose run_date+T+slot equals the run id", () => {
    const records = [WAIT, B, A];
    expect(chainForRun(teamRun(A), records)).toEqual(evidenceChain(A));
    expect(chainForRun(teamRun(B), records)).toEqual(evidenceChain(B));
  });
  it("finds a complete chain (PR url, verdict, path, broken check)", () => {
    expect(chainForRun(teamRun(A), [A])).toEqual({
      runId: "2026-02-03T0900", taskId: "HL-901", mode: "BUILD",
      pr: { number: 41, url: "https://github.com/PPDSAgent/harness-lab/pull/41" },
      review: { verdict: "CONDITIONAL", path: "reviews/2026-02-03T0900-HL-901-r2.md" },
      brokenCheck: { fileLine: "src/lib/alpha.ts:17", wentRed: true },
    });
  });
  it("also resolves a non-BUILD/FIX team run (the run still has a record), same value as evidenceChain", () => {
    expect(chainForRun(teamRun(WAIT), [A, WAIT])).toEqual(evidenceChain(WAIT));
  });
  it("does not depend on record order or on junk between records", () => {
    expect(chainForRun(teamRun(B), [...JUNK, B, A])).toEqual(evidenceChain(B));
    expect(chainForRun(teamRun(B), [A, B, ...JUNK])).toEqual(evidenceChain(B));
  });
  it("matches every real runs/*.json record to its own chain", () => {
    const dir = path.join(__dirname, "..", "runs");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const records = files.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as unknown);
    expect(files.length).toBeGreaterThan(0);
    for (const r of records) {
      const run = teamRun(r);
      expect(run.id, "every committed record has a run id").not.toBeNull();
      expect(chainForRun(run, records), String(run.id)).toEqual(evidenceChain(r));
    }
  });
});

describe("HL-021b B1: null cases", () => {
  it("a team run whose id is null returns null", () => {
    const run = parseRunRecord("{}");
    expect(run.id).toBeNull();
    expect(chainForRun(run, [A, B])).toBeNull();
  });
  it("a team run with no matching record returns null", () => {
    expect(chainForRun(teamRun(rec("2026-03-01", "0900", "BUILD")), [A, B, WAIT])).toBeNull();
    expect(chainForRun(teamRun(A), [])).toBeNull();
  });
  it("a claude-code run returns null even if a record's id would equal its id", () => {
    const run = loadFixtureRuns().find((r) => r.harness === "claude-code")!;
    expect(run.harness).toBe("claude-code");
    expect(chainForRun(run, [A, B])).toBeNull();
    expect(chainForRun({ ...run, id: "2026-02-03T0900" }, [A, B])).toBeNull();
  });
  it("a codex run returns null even if its id equals a record's id", () => {
    const run = loadFixtureRuns().find((r) => r.harness === "codex")!;
    expect(run.harness).toBe("codex");
    expect(chainForRun(run, [A, B])).toBeNull();
    expect(chainForRun({ ...run, id: "2026-02-03T0900" }, [A, B])).toBeNull();
  });
});

describe("HL-021b B1: malformed input never throws", () => {
  it("junk-only record lists give null, not an exception", () => {
    expect(() => chainForRun(teamRun(A), JUNK)).not.toThrow();
    expect(chainForRun(teamRun(A), JUNK)).toBeNull();
  });
  it("a matching record with wrong-typed fields gives its evidenceChain value, not an exception", () => {
    const bad = { run_date: "2026-02-03", slot: "0900", mode: 5, task_id: [], pr_number: "41", review: "PASS", mutation_check: [1] };
    expect(() => chainForRun(teamRun(A), [bad])).not.toThrow();
    expect(chainForRun(teamRun(A), [bad])).toEqual(evidenceChain(bad));
  });
  it("a malformed run argument or records argument does not throw", () => {
    for (const run of [null, undefined, 3, "x", {}, { harness: "team" }, { harness: "team", id: 5 }]) {
      expect(() => chainForRun(run, [A])).not.toThrow();
      expect(chainForRun(run, [A])).toBeNull();
    }
    expect(() => chainForRun(teamRun(A), [null, undefined] as unknown[])).not.toThrow();
  });
});
