# Run record schema — `runs/YYYY-MM-DDTHHMM.json`

There is one record per run: the Pacific date plus the slot time (for example
`2026-11-02T1238.json`). The lead writes it from values observed in that run only: unknown
means `null`, never an estimate.

- **BUILD and FIX runs** commit their record on their branch.
- **WAIT and SECURITY runs** have no branch. They post their record as JSON in their
  "finished" comment on the **Run log** issue, and the next BUILD run commits it.

Phase 1 reads these records as the Observatory's third source. HL-002 turns this
description into a JSON Schema and a validator test.

```jsonc
{
  "schema_version": 3,
  "run_date": "2026-11-02",             // Pacific date
  "slot": "1238",                       // actual start time, HHMM Pacific
  "started_at": "2026-11-02T20:38:04Z", // UTC, from `date -u`
  "finished_at": "…",                   // UTC, or null if the run died
  "mode": "BUILD",                      // BUILD | FIX | WAIT | SECURITY
  "task_id": "HL-001",                  // null for WAIT/SECURITY
  "phase": "0-foundations",
  "branch": "run/2026-11-02-1238-HL-001",
  "base": "main",                       // stack parent
  "pr_number": null,
  "loop_header": { "goal": "…", "verifier": "…", "step": "…", "stop": "…", "budget": "2h · 9 dispatches · 1 fix pass" },
  "freeze_sha": "abc1234",
  "fix_freeze_shas": [],                // one per fix freeze this run, in order
  "exemption": null,                    // the §4 step 1b exemption claimed, if any
  "dispatches": [                       // one per role invocation, in order
    { "role": "test-engineer", "duty": "freeze", "model": "sonnet", "outcome": "red-as-expected", "started_at": "…", "finished_at": "…" }
  ],
  "checks": [ { "name": "npm test", "exit": 0 } ],   // exit codes as read, unpiped
  "suites": [                           // from the test engineer's verify table
    { "name": "regression", "exit": 0, "passed": 41, "failed": 0, "skipped": 0, "duration_ms": 9120, "new_failures": [] }
  ],
  "perf": [                             // measured vs TESTING.md budgets; machine noted
    { "metric": "lcp_main_route", "value": 1830, "unit": "ms", "budget": 2500, "machine": "cloud-runner" }
  ],
  "frozen_tests_unchanged": true,
  "frozen_tests_all_ran": true,         // every file in every manifest of the task passed in the runner report
  "head_unchanged_by_review": true,
  "mutation_check": { "file_line": "src/lib/x.ts:42", "went_red": true },
  "review": { "verdict": "PASS", "path": "reviews/2026-11-02T1238-HL-001-r1.md", "fix_pass_used": false, "unflagged_claims": 0 },
  "not_claimed": [],                    // required at v3. What this run did not verify, written by the lead from this run only; an empty list is allowed.
  "flakes": [],                         // required at v3. Each entry is { "test": "<file>::<name>", "reruns_base": 3, "fails_base": 0, "reruns_head": 3, "fails_head": 1, "classified": "flake" | "regression", "quarantine": "<issue URL>" | null }.
  "directions_acked": [],               // URLs of Will's Daily status comments acked this run
  "design": { "verdict": null, "screens": [] },
  "redteam": null,                      // SECURITY runs: { "issue": 12, "critical": 0, "high": 1, "medium": 2, "low": 0, "seeded_caught": 4, "seeded_total": 5 }
  "stop_rule": { "project": "P0", "status": "not-yet-checkable", "evidence": null },
  "limits_hit": null,                   // e.g. "rate limit at dispatch 3", only if observed
  "tokens": null,                       // only if measured: input + output + cache creation + cache read tokens
  "cost_usd": null,                     // never estimated
  "needs_will": [],
  "notes": ""                           // e.g. "goal_cmd: unavailable"
}
```

`schema_version` 2 records stay valid as v2: `tools/scorecard.py` `load_records()`
calls `validate_record`, which accepts version 2 without `not_claimed`, `flakes`, or
`review.unflagged_claims`, and requires those fields at version 3. Invalid files are
skipped and listed under `invalid`; `--strict` exits 1 when that list is non-empty.
HL-002's JSON Schema (`schemas/run-record.schema.json`) accepts both versions too and requires
`not_claimed` and `flakes` at v3, with `unflagged_claims` on any `review` object. It differs from
`validate_record` in two places: it accepts `review: null` at v3 (WAIT and SECURITY runs have
no review; `validate_record` rejects that), and it rejects `flakes[].classified: null`
(`validate_record` accepts it). `phase` may be `null`. Tests:
`tests/hl-002.run-record.test.ts` and `tests/run-record-v3.test.ts`.

- **`not_claimed`:** a list of strings naming what this run did not verify, for example
  `"perf on a real phone"`. The lead writes it from this run only. An empty list is
  allowed.
- **`flakes`:** each entry is `{ "test": "<file>::<name>", "reruns_base": 3, "fails_base": 0, "reruns_head": 3, "fails_head": 1, "classified": "flake" | "regression", "quarantine": "<issue URL>" | null }`.
- **`review.unflagged_claims`:** the reviewer's count of claims in the PR body that have
  no evidence and are not listed in `not_claimed`. It is `null` if not counted.

**Privacy:** no prompts, no transcript text, no file contents. Only the metadata above.
