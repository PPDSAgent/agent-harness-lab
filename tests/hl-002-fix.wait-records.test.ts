// @vitest-environment node
// FROZEN acceptance tests for HL-002-fix (WAIT-record nulls in the run-record schema).
// Written by the test engineer before the fix; the builder may not edit this file.
// All sample data is SYNTHETIC and inline. The WAIT shape follows a team run record.
//
// Problem: WAIT/SECURITY runs have no branch, so base is null, and GitHub check-run
// conclusions have no exit code, so checks[].exit is null. runs/SCHEMA.md: unknown means null.
// Out of scope: the dispatch-shape error seen on one posted record; dispatch strictness
// must be unchanged (test 3).
import { describe, expect, it } from "vitest";
import { validateRunRecord } from "../src/lib/validate-run-record";

const waitRecord = (): Record<string, unknown> => ({
  base: null,
  branch: null,
  checks: [
    { exit: 0, name: "rules main missing-count (printed 0)" },
    { exit: null, name: "check-runs #13 993c044: checks=failure guard=success" },
  ],
  cost_usd: null,
  design: { screens: [], verdict: null },
  directions_acked: [],
  dispatches: [],
  finished_at: "2026-11-05T20:41:16Z",
  freeze_sha: null,
  frozen_tests_all_ran: null,
  frozen_tests_unchanged: null,
  head_unchanged_by_review: null,
  limits_hit: "open run PRs 5/5 (cap)",
  loop_header: null,
  mode: "WAIT",
  mutation_check: null,
  needs_will: ["merge #12 to free a cap slot"],
  notes: "SYNTHETIC wait record",
  perf: [],
  phase: "1-observatory",
  pr_number: null,
  redteam: null,
  review: null,
  run_date: "2026-11-05",
  schema_version: 2,
  slot: "1238",
  started_at: "2026-11-05T20:38:43Z",
  stop_rule: { evidence: "SYNTHETIC", project: "P1", status: "not-yet-checkable" },
  suites: [],
  task_id: null,
  tokens: null,
});

// Ajv-style errors carry instancePath; for a missing required property it is the parent.
const paths = (errors: unknown[]): string[] =>
  errors.map((e) => String((e as { instancePath?: unknown }).instancePath ?? ""));

describe("HL-002-fix: WAIT records with null base and null check exit", () => {
  it("accepts base null, branch null, task_id null and a check with exit null", () => {
    const r = validateRunRecord(waitRecord());
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("still rejects base of the wrong type (number)", () => {
    const rec = { ...waitRecord(), base: 5 };
    const r = validateRunRecord(rec);
    expect(r.valid).toBe(false);
    expect(paths(r.errors)).toContain("/base");
  });

  it("still rejects checks[].exit as a string (no loosening beyond null)", () => {
    const rec = { ...waitRecord(), checks: [{ exit: "0", name: "x" }] };
    const r = validateRunRecord(rec);
    expect(r.valid).toBe(false);
    expect(paths(r.errors)).toContain("/checks/0/exit");
  });

  it.each(["duty", "outcome", "started_at", "finished_at"])(
    "dispatch strictness unchanged: a dispatch missing %s is still invalid",
    (missing) => {
      const dispatch: Record<string, unknown> = {
        duty: "freeze",
        outcome: "ok",
        started_at: "2026-11-05T20:38:43Z",
        finished_at: "2026-11-05T20:40:00Z",
      };
      delete dispatch[missing];
      const r = validateRunRecord({ ...waitRecord(), dispatches: [dispatch] });
      expect(r.valid).toBe(false);
      // The error must come from the dispatch itself (not from some other field).
      expect(paths(r.errors).some((p) => p.startsWith("/dispatches/0"))).toBe(true);
    },
  );
});
