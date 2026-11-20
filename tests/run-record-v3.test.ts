// Run records at schema_version 3 (runs/SCHEMA.md). Will's call, 2026-11-16: the JSON Schema
// accepts v3, so records the lead writes at v3 can be committed again; v2 records stay valid.
// SYNTHETIC records only.
import { describe, expect, it } from "vitest";
import { validateRunRecord } from "../src/lib/validate-run-record";

const v2 = (): Record<string, unknown> => ({
  schema_version: 2,
  run_date: "2026-11-02",
  slot: "1238",
  started_at: "2026-11-02T20:38:04Z",
  finished_at: "2026-11-02T22:00:00Z",
  mode: "BUILD",
  task_id: "HL-001",
  phase: "0-foundations",
  branch: "run/2026-11-02-1238-HL-001",
  base: "main",
  pr_number: 12,
  loop_header: { goal: "g", verifier: "v", step: "s", stop: "x", budget: "2h" },
  freeze_sha: "abc1234",
  dispatches: [],
  checks: [{ name: "npm test", exit: 0 }],
  suites: [],
  perf: [],
  frozen_tests_unchanged: true,
  frozen_tests_all_ran: true,
  head_unchanged_by_review: true,
  mutation_check: { file_line: "src/lib/x.ts:42", went_red: true },
  review: { verdict: "PASS", path: "reviews/x.md", fix_pass_used: false },
  directions_acked: [],
  design: { verdict: null, screens: [] },
  redteam: null,
  stop_rule: { project: "P0", status: "not-yet-checkable", evidence: null },
  limits_hit: null,
  tokens: null,
  cost_usd: null,
  needs_will: [],
  notes: "",
});

const v3 = (): Record<string, unknown> => ({
  ...v2(),
  schema_version: 3,
  fix_freeze_shas: [],
  exemption: null,
  review: { verdict: "PASS", path: "reviews/x.md", fix_pass_used: false, unflagged_claims: 0 },
  not_claimed: ["perf on a real phone"],
  flakes: [
    { test: "tests/a.test.ts::b", reruns_base: 3, fails_base: 0, reruns_head: 3, fails_head: 1, classified: "flake", quarantine: null },
  ],
});

const drop = (rec: Record<string, unknown>, key: string) => {
  const copy = { ...rec };
  delete copy[key];
  return copy;
};

describe("run record schema_version 3", () => {
  it("control: a v2 record is still valid", () => {
    expect(validateRunRecord(v2()).valid).toBe(true);
  });

  it("a full v3 BUILD record is valid", () => {
    const r = validateRunRecord(v3());
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("a v3 WAIT record with review null is valid", () => {
    // phase null: a WAIT run has no task, and SCHEMA.md says unknown means null.
    expect(validateRunRecord({ ...v3(), mode: "WAIT", task_id: null, phase: null, review: null }).valid).toBe(true);
  });

  it.each(["not_claimed", "flakes"])("v3 without %s fails", (key) => {
    expect(validateRunRecord(drop(v3(), key)).valid).toBe(false);
  });

  it("v3 with a review object lacking unflagged_claims fails", () => {
    expect(validateRunRecord({ ...v3(), review: { verdict: "PASS", path: "reviews/x.md", fix_pass_used: false } }).valid).toBe(false);
  });

  it("a flake with an unknown classification fails", () => {
    const rec = v3();
    rec.flakes = [{ ...(rec.flakes as object[])[0], classified: "maybe" }];
    expect(validateRunRecord(rec).valid).toBe(false);
  });

  it("schema_version 4 fails", () => {
    expect(validateRunRecord({ ...v3(), schema_version: 4 }).valid).toBe(false);
  });
});
