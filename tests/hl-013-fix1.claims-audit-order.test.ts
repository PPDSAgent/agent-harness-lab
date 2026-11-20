// @vitest-environment node
// FROZEN fix1 regression test for HL-013 A2 (reviewer r1 finding 4; the CONTRACT comment in
// tests/hl-013.claims-audit.test.ts promises "null / unparsable last"). Builder may not edit this file.
// Expected to be GREEN at the freeze: it covers a branch (src/lib/claims-audit.ts:25-27) no earlier test checks.
// All inline data is SYNTHETIC.
import { describe, expect, it } from "vitest";
import type { Harness, Run } from "../src/lib/ingest";
import { auditClaims } from "../src/lib/claims-audit";

const mk = (harness: Harness, id: string, startedAt: string | null): Run => ({
  harness, id, startedAt, endedAt: null, durationMs: null, steps: [], toolCalls: [], usage: null, verdicts: [],
  claims: [{ text: `claim ${id}`, hasEvidence: false, stepIndex: 1 }], recordCount: 0, droppedCount: 0,
});

describe("HL-013 A2: unparsable start times", () => {
  it("sorts an unparsable startedAt after parsable ones within a harness, whatever the input order", () => {
    const bad = mk("codex", "run-bad", "not-a-date");
    const early = mk("codex", "run-early", "2026-05-01T10:00:00Z");
    const late = mk("codex", "run-late", "2026-05-02T10:00:00Z");
    for (const input of [[bad, late, early], [early, bad, late], [late, early, bad]]) {
      expect(auditClaims(input).rows.map((r) => r.runId)).toEqual(["run-early", "run-late", "run-bad"]);
    }
  });
  it("still groups by harness first: an unparsable time does not move a run out of its harness", () => {
    const rows = auditClaims([mk("team", "t", "2026-05-01T10:00:00Z"), mk("claude-code", "c-bad", "not-a-date"), mk("claude-code", "c-ok", "2026-06-01T10:00:00Z")]).rows;
    expect(rows.map((r) => r.runId)).toEqual(["c-ok", "c-bad", "t"]);
  });
});
