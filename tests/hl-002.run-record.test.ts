// @vitest-environment node
// FROZEN acceptance tests for HL-002 (run-record schema and validator).
// Written by the test engineer before the build; the builder may not edit this file.
// All sample data is SYNTHETIC and inline (no fixture files).
//
// INTERFACE CONTRACT (paths relative to repo root):
//   schemas/run-record.schema.json
//       A JSON Schema document (draft 2020-12 or draft-07) with a string "$schema" set
//       to one of:
//         https://json-schema.org/draft/2020-12/schema
//         http://json-schema.org/draft-07/schema#   (or the same without the trailing "#")
//       and "type": "object". It encodes runs/SCHEMA.md (schema_version 2).
//   src/lib/validate-run-record.ts
//       export function validateRunRecord(record: unknown): { valid: boolean; errors: unknown[] }
//       errors is an array; it is empty when valid and non-empty when invalid. The
//       validator library is the builder's choice; if it is added to package.json, that
//       is fine. The function must not throw on any JSON value.
//
// DECISIONS (SCHEMA.md is silent; flagged for Will):
//   D1. Every top-level key shown in SCHEMA.md is REQUIRED. Unknown means null, never
//       absent ("unknown means null"), and both committed records carry every key.
//   D2. Extra top-level keys are REJECTED (additionalProperties:false at top level), so a
//       typo like "taskid" cannot silently pass. Nested objects are not constrained here.
//   D3. Nullable-by-spec fields: task_id, finished_at, pr_number, freeze_sha, loop_header,
//       frozen_tests_*, head_unchanged_by_review, mutation_check, review, redteam,
//       limits_hit, tokens, cost_usd (committed records show these as null).
//   D4. Format strictness (timestamps, task_id shape) is deliberately NOT tested: SCHEMA.md
//       gives only examples. Types, the mode enum, schema_version, and the slot/run_date
//       shapes are tested.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateRunRecord } from "../src/lib/validate-run-record";

const root = fileURLToPath(new URL("..", import.meta.url));
const SCHEMA_PATH = "schemas/run-record.schema.json";

// A fully populated BUILD record, SYNTHETIC.
const validBuild = (): Record<string, unknown> => ({
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
  dispatches: [
    { role: "test-engineer", duty: "freeze", model: "sonnet", outcome: "red-as-expected", started_at: null, finished_at: null },
  ],
  checks: [{ name: "npm test", exit: 0 }],
  suites: [{ name: "regression", exit: 0, passed: 41, failed: 0, skipped: 0, duration_ms: 9120, new_failures: [] }],
  perf: [{ metric: "lcp_main_route", value: 1830, unit: "ms", budget: 2500, machine: "cloud-runner" }],
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

// A SECURITY-style record: no branch, task, review, etc. (SYNTHETIC)
const validSecurity = (): Record<string, unknown> => ({
  ...validBuild(),
  mode: "SECURITY",
  task_id: null,
  branch: null,
  finished_at: null,
  pr_number: null,
  loop_header: null,
  freeze_sha: null,
  frozen_tests_unchanged: null,
  frozen_tests_all_ran: null,
  head_unchanged_by_review: null,
  mutation_check: null,
  review: null,
  redteam: { issue: null, critical: 0, high: 0, medium: 1, low: 2, seeded_caught: 1, seeded_total: 5 },
  perf: [{ metric: "lcp_main_route", value: null, unit: "ms", budget: 2500, machine: "cloud-runner" }],
});

const without = (rec: Record<string, unknown>, key: string) => {
  const copy = { ...rec };
  delete copy[key];
  return copy;
};

describe("HL-002 schema document", () => {
  const schema = JSON.parse(readFileSync(path.join(root, SCHEMA_PATH), "utf8"));

  it("schema file is a JSON Schema document (draft 2020-12 or draft-07) describing an object", () => {
    expect(schema.$schema).toMatch(
      /^https?:\/\/json-schema\.org\/(draft\/2020-12\/schema|draft-07\/schema)#?$/,
    );
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeTypeOf("object");
  });

  it("schema declares every top-level field of runs/SCHEMA.md", () => {
    const keys = Object.keys(validBuild());
    for (const k of keys) expect(schema.properties, `missing property ${k}`).toHaveProperty(k);
  });
});

describe("HL-002 Accept: a deliberately broken sample (missing task_id) fails validation", () => {
  it("record missing task_id is invalid and reports an error", () => {
    const r = validateRunRecord(without(validBuild(), "task_id"));
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("HL-002 Accept: all committed run records pass", () => {
  const dir = path.join(root, "runs");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

  it("at least one run record is found (an empty glob cannot pass vacuously)", () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it.each(files)("runs/%s validates", (file) => {
    const rec = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const r = validateRunRecord(rec);
    expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
    expect(r.valid).toBe(true);
  });
});

describe("HL-002 spec fidelity (schema cannot be trivially permissive)", () => {
  it("a fully populated BUILD sample is valid", () => {
    const r = validateRunRecord(validBuild());
    expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("task_id: null is allowed (WAIT/SECURITY) and a SECURITY sample is valid", () => {
    const r = validateRunRecord(validSecurity());
    expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("task_id of the wrong type (number) fails", () => {
    expect(validateRunRecord({ ...validBuild(), task_id: 1 }).valid).toBe(false);
  });

  it.each(["BUILD", "FIX", "WAIT", "SECURITY"])("mode %s is accepted", (mode) => {
    expect(validateRunRecord({ ...validBuild(), mode }).valid).toBe(true);
  });

  it.each(["build", "DEPLOY", "", null, 3])("mode %j fails", (mode) => {
    expect(validateRunRecord({ ...validBuild(), mode }).valid).toBe(false);
  });

  it("schema_version other than 2 fails", () => {
    expect(validateRunRecord({ ...validBuild(), schema_version: 1 }).valid).toBe(false);
    expect(validateRunRecord({ ...validBuild(), schema_version: "2" }).valid).toBe(false);
  });

  it("slot must be four digits (HHMM) and run_date must be YYYY-MM-DD", () => {
    expect(validateRunRecord({ ...validBuild(), slot: "12" }).valid).toBe(false);
    expect(validateRunRecord({ ...validBuild(), slot: 1238 }).valid).toBe(false);
    expect(validateRunRecord({ ...validBuild(), run_date: "11/02/2026" }).valid).toBe(false);
  });

  it("every top-level field of SCHEMA.md is required (D1)", () => {
    for (const key of Object.keys(validBuild())) {
      expect(validateRunRecord(without(validBuild(), key)).valid, `without ${key}`).toBe(false);
    }
  });

  it("an unknown top-level field is rejected (D2)", () => {
    expect(validateRunRecord({ ...validBuild(), taskid: "HL-001" }).valid).toBe(false);
  });

  it("array fields reject the wrong type", () => {
    expect(validateRunRecord({ ...validBuild(), dispatches: "none" }).valid).toBe(false);
    expect(validateRunRecord({ ...validBuild(), checks: {} }).valid).toBe(false);
    expect(validateRunRecord({ ...validBuild(), needs_will: "x" }).valid).toBe(false);
  });

  it("check and suite exit codes must be integers (or null for a suite), not strings", () => {
    expect(validateRunRecord({ ...validBuild(), checks: [{ name: "npm test", exit: "0" }] }).valid).toBe(false);
    const s = [{ name: "r", exit: "0", passed: 1, failed: 0, skipped: 0, duration_ms: 1, new_failures: [] }];
    expect(validateRunRecord({ ...validBuild(), suites: s }).valid).toBe(false);
  });

  it("non-object inputs are invalid and do not throw", () => {
    for (const bad of [null, undefined, 42, "x", [], true]) {
      const r = validateRunRecord(bad);
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
});
