// @vitest-environment jsdom
// Red tests for a chat-requested fix (CLAUDE.md rule 2, source or discard): team runs come from the
// team's own runs/*.json records, so no screen may call them "SYNTHETIC fixtures". Fixture runs keep
// the SYNTHETIC label. Components are rendered directly with runs from the loaders, so these tests
// do not depend on how App loads its data.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import type { Run, ToolCall } from "../src/lib/ingest";
import { loadFixtureRuns, loadTeamRuns } from "../src/lib/load-fixture-runs";
import { RunsList } from "../src/components/runs-list";
import { RunDetail } from "../src/components/run-detail";
import RunSwimlane from "../src/components/run-swimlane";

afterEach(cleanup);

const fixtureRuns = loadFixtureRuns();
const teamRuns = loadTeamRuns();
const call = (): ToolCall => ({
  id: null, name: "tool-a", startedAt: "2026-11-01T00:00:01.000Z", endedAt: "2026-11-01T00:00:03.000Z", durationMs: 2000, isError: false, skill: null,
});
const sources = () => screen.queryAllByText(/source:/i).map((el) => el.textContent ?? "");

describe("fix: source labels name where the data really came from", () => {
  it("loaders give both kinds of run (precondition)", () => {
    expect(fixtureRuns.length).toBeGreaterThan(0);
    expect(teamRuns.length).toBeGreaterThan(0);
    expect(teamRuns.every((r) => r.harness === "team")).toBe(true);
  });

  it("runs list, Team filter: the source line names runs/*.json and does not call them SYNTHETIC fixtures", () => {
    render(<RunsList runs={[...fixtureRuns, ...teamRuns]} />);
    fireEvent.click(screen.getByRole("button", { name: /^team$/i }));
    const s = sources();
    expect(s.length).toBeGreaterThan(0);
    expect(s.join(" | ")).toMatch(/runs\/\*\.json/);
    expect(s.join(" | ")).not.toMatch(/SYNTHETIC fixtures/i);
  });

  it("runs list, Claude Code and Codex filters: the source line still names the SYNTHETIC fixtures", () => {
    render(<RunsList runs={[...fixtureRuns, ...teamRuns]} />);
    for (const name of [/^claude code$/i, /^codex$/i]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(sources().join(" | ")).toMatch(/SYNTHETIC fixtures/);
    }
  });

  it("run detail of a team run does not say SYNTHETIC fixtures and names runs/*.json", () => {
    render(<RunDetail run={teamRuns[0]} onBack={() => {}} />);
    const s = sources().join(" | ");
    expect(s).toMatch(/runs\/\*\.json/);
    expect(s).not.toMatch(/SYNTHETIC fixtures/i);
  });

  it("run detail of a fixture run still says SYNTHETIC", () => {
    render(<RunDetail run={fixtureRuns[0]} onBack={() => {}} />);
    expect(sources().join(" | ")).toMatch(/SYNTHETIC/);
  });

  it("swimlane of a team run does not say SYNTHETIC fixtures and names runs/*.json", async () => {
    // Team records may carry no timed tool calls (empty state, no source line), so use an inline run.
    const withCalls: Run = {
      ...teamRuns[0], id: "team-timed-01", harness: "team", steps: [{ index: 0, timestamp: "2026-11-01T00:00:00.000Z", text: "t", usage: null, sourceLines: [1], toolCalls: [call()] }],
      toolCalls: [call()],
    };
    render(<RunSwimlane run={withCalls} />);
    await waitFor(() => expect(screen.getByRole("figure")).toBeTruthy());
    const text = screen.getByRole("figure").textContent ?? "";
    expect(text).toMatch(/runs\/\*\.json/);
    expect(text).not.toMatch(/SYNTHETIC fixtures/i);
  });

  it("swimlane of a fixture run still says SYNTHETIC", () => {
    render(<RunSwimlane run={fixtureRuns[0]} />);
    expect(screen.getByRole("figure").textContent ?? "").toMatch(/SYNTHETIC/);
  });
});
