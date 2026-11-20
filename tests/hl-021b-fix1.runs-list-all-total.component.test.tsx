// @vitest-environment jsdom
// FROZEN fix-1 acceptance tests for HL-021b (reviewer r1 required fix 1). Builder may not edit this file. SYNTHETIC data.
// Contract chosen here: "total" means the number of rows the list holds, team runs included (rows.length), so under the
// "All" filter (which hides team runs) the count text reads "<shown> of <total> runs". A visible note under "All" says
// that "All" does not include team runs. It does not contradict frozen HL-010a tests: those require 90 rows by default
// (team runs stay hidden under All) and only match /runs/ in the caption, not the count paragraph.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type { Run } from "../src/lib/ingest";
import { RunsList } from "../src/components/runs-list";

afterEach(cleanup);

function mk(over: Partial<Run>): Run {
  return {
    harness: "claude-code", id: "id", startedAt: null, endedAt: null, durationMs: null,
    steps: [], toolCalls: [], usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0, ...over,
  };
}
// 2 claude-code + 1 codex + 4 team = 7 rows; "All" shows 3.
const runs: Run[] = [
  mk({ id: "cc-1", harness: "claude-code", startedAt: "2026-10-01T00:00:00.000Z" }),
  mk({ id: "cc-2", harness: "claude-code", startedAt: "2026-10-02T00:00:00.000Z" }),
  mk({ id: "cx-1", harness: "codex", startedAt: "2026-10-03T00:00:00.000Z" }),
  ...[1, 2, 3, 4].map((n) => mk({ id: `2026-11-0${n}T0100`, harness: "team", startedAt: `2026-11-0${n}T01:00:00.000Z` })),
];
const NOTE = /(not include|exclude|without|except).{0,40}team runs|team runs.{0,40}(not (included|shown)|excluded|hidden|separate)/i;

describe("HL-021b fix1 r1-1: All filter count and note", () => {
  it("under All the count text reads '3 of 7 runs' (shown of every row held, team runs included)", () => {
    const { container } = render(<RunsList runs={runs} />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(screen.getByText(/^\s*3 of 7 runs\s*$/)).toBeTruthy();
  });

  it("under All a visible note says All does not include team runs", () => {
    render(<RunsList runs={runs} />);
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it("choosing Codex reads '1 of 7 runs' and Team reads '4 of 7 runs' (total stays the whole list)", () => {
    render(<RunsList runs={runs} />);
    fireEvent.click(screen.getByRole("button", { name: "Codex" }));
    expect(screen.getByText(/^\s*1 of 7 runs\s*$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(screen.getByText(/^\s*4 of 7 runs\s*$/)).toBeTruthy();
  });

  it("with no team runs the count still reads 'N of N runs'", () => {
    render(<RunsList runs={runs.slice(0, 3)} />);
    expect(screen.getByText(/^\s*3 of 3 runs\s*$/)).toBeTruthy();
  });
});
