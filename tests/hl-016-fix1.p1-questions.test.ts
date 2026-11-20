// FROZEN fix-1 test for HL-016 (reviewer finding F2). Builder may not edit this file. All inline data is SYNTHETIC.
// A failure rate is failures over KNOWN outcomes; an unknown outcome is a gap, not a success. Null when none known.
import { describe, expect, it } from "vitest";
import { answerP1Questions } from "../src/lib/p1-questions";
import type { Run, ToolCall } from "../src/lib/ingest";

const call = (skill: string, isError: boolean | null): ToolCall => ({ id: null, name: "Skill", startedAt: null, endedAt: null, durationMs: null, isError, skill });
const run: (calls: ToolCall[]) => Run = (calls) => ({
  harness: "claude-code", id: "run-01", startedAt: null, endedAt: null, durationMs: null, steps: [], toolCalls: calls, usage: null,
  verdicts: [], claims: [], recordCount: 0, droppedCount: 0,
});

describe("HL-016 fix1 F2: failure rate over known outcomes", () => {
  it("one failure and one unknown outcome gives a rate of 1, not 0.5", () => {
    const a = answerP1Questions([run([call("beta", true), call("beta", null)])]);
    const row = a.skillFailures.ranking.find((r) => r.skill === "beta")!;
    expect(row).toMatchObject({ invocations: 2, failures: 1 });
    expect(row.failureRate).toBe(1);
  });
  it("one failure, one success and one unknown gives a rate of 0.5", () => {
    const a = answerP1Questions([run([call("gamma", true), call("gamma", false), call("gamma", null)])]);
    expect(a.skillFailures.ranking[0]!.failureRate).toBe(0.5);
  });
  it("no known outcome gives a null rate", () => {
    const a = answerP1Questions([run([call("solo", null), call("solo", null)])]);
    expect(a.skillFailures.ranking[0]!.failureRate).toBeNull();
  });
});
