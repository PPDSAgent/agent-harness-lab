// @vitest-environment jsdom
// FROZEN acceptance tests for HL-010b (run detail with a step timeline). Builder may not edit this file.
// All inline data is SYNTHETIC.
//
// CONTRACT: RunsList (src/components/runs-list.tsx, props unchanged: { runs: Run[] }) gains the detail view.
//   - every <tbody> row of the runs table contains a real control (role=button or role=link) that opens that
//     run's detail view; clicking the first such control in the row opens it.
//   - the detail view shows a heading (any level) containing the run's id.
//   - steps are shown in step order (Run.steps order), each step's text visible.
//   - each tool call is shown as the innermost li / tr / article that contains its name, and that element's
//     text carries: the name, its duration via formatDuration (src/lib/format-duration.ts), and the word
//     "error" (case-insensitive) when isError === true, and not when isError is false or null.
//   - null name / null durationMs render "—"; never "null", "undefined" or "NaN".
//   - the steps and tool calls of the OTHER runs are not shown.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type { Run, Step, ToolCall } from "../src/lib/ingest";
import { RunsList } from "../src/components/runs-list";

afterEach(cleanup);

const call = (name: string | null, durationMs: number | null, isError: boolean | null): ToolCall => ({
  id: null, name, startedAt: null, endedAt: null, durationMs, isError,
});
const step = (index: number, text: string | null, toolCalls: ToolCall[], timestamp: string | null = null): Step => ({
  index, timestamp, text, usage: null, toolCalls, sourceLines: [index + 2],
});
function mk(over: Partial<Run>): Run {
  return {
    harness: "claude-code", id: "id", startedAt: null, endedAt: null, durationMs: null,
    steps: [], toolCalls: [], usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0, ...over,
  };
}

const s0 = step(0, "step-text-alpha", [call("tool-fast", 59949, false), call("tool-broken", 119600, true)], "2026-10-01T00:00:01.000Z");
const s1 = step(1, "step-text-bravo", [call("tool-nodur", null, null)], "2026-10-01T00:00:02.000Z");
const s2 = step(2, "step-text-charlie", [call(null, 59990, false)], "2026-10-01T00:00:03.000Z");
const detailRun = mk({
  id: "run-detail-01", harness: "claude-code", startedAt: "2026-10-09T00:00:00.000Z", durationMs: 90000,
  steps: [s0, s1, s2], toolCalls: [...s0.toolCalls, ...s1.toolCalls, ...s2.toolCalls],
});
const otherRun = mk({
  id: "run-other-02", harness: "codex", startedAt: "2026-10-01T00:00:00.000Z", durationMs: 5000,
  steps: [step(0, "other-run-step-text", [call("other-run-tool", 10, false)])],
  toolCalls: [call("other-run-tool", 10, false)],
});
const runs = [detailRun, otherRun];

const bodyRows = (c: HTMLElement) => Array.from(c.querySelectorAll("tbody tr")) as HTMLElement[];
function openRow(container: HTMLElement, id: string) {
  const row = bodyRows(container).find((r) => r.textContent?.includes(id));
  if (!row) throw new Error(`no row for ${id}`);
  const ctl = within(row).queryAllByRole("button")[0] ?? within(row).queryAllByRole("link")[0];
  if (!ctl) throw new Error(`row ${id} has no button or link to open the detail`);
  fireEvent.click(ctl);
}
const item = (text: string) => {
  const el = screen.getByText(text);
  const box = el.closest("li, tr, article") as HTMLElement | null;
  if (!box) throw new Error(`no li/tr/article around ${text}`);
  return box;
};

describe("HL-010b run detail", () => {
  it("every list row has a control that opens the run detail", () => {
    const { container } = render(<RunsList runs={runs} />);
    for (const r of bodyRows(container)) {
      expect(within(r).queryAllByRole("button").length + within(r).queryAllByRole("link").length).toBeGreaterThan(0);
    }
  });

  it("a row opens the detail view with a heading naming the run", () => {
    const { container } = render(<RunsList runs={runs} />);
    openRow(container, "run-detail-01");
    const heading = screen.getAllByRole("heading").find((h) => h.textContent?.includes("run-detail-01"));
    expect(heading).toBeDefined();
  });

  it("shows only the opened run's steps", () => {
    const { container } = render(<RunsList runs={runs} />);
    openRow(container, "run-detail-01");
    expect(screen.getByText("step-text-alpha")).toBeTruthy();
    expect(screen.queryByText("other-run-step-text")).toBeNull();
    expect(screen.queryByText("other-run-tool")).toBeNull();
  });

  it("shows steps in order", () => {
    const { container } = render(<RunsList runs={runs} />);
    openRow(container, "run-detail-01");
    const html = document.body.textContent ?? "";
    const a = html.indexOf("step-text-alpha");
    const b = html.indexOf("step-text-bravo");
    const c = html.indexOf("step-text-charlie");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("shows each step's tool calls in order with their durations", () => {
    const { container } = render(<RunsList runs={runs} />);
    openRow(container, "run-detail-01");
    const fast = item("tool-fast");
    expect(fast.textContent).toContain("59.9 s");
    const broken = item("tool-broken");
    expect(broken.textContent).toContain("2 min 0 s");
    const body = document.body.textContent ?? "";
    expect(body.indexOf("tool-broken")).toBeGreaterThan(body.indexOf("tool-fast"));
  });

  it("marks an errored tool call as an error and leaves ok and unknown calls unmarked", () => {
    const { container } = render(<RunsList runs={runs} />);
    openRow(container, "run-detail-01");
    expect(item("tool-broken").textContent).toMatch(/error/i);
    expect(item("tool-fast").textContent).not.toMatch(/error/i);
    expect(item("tool-nodur").textContent).not.toMatch(/error/i);
  });

  it("renders a null duration as — and never null/undefined/NaN", () => {
    const { container } = render(<RunsList runs={runs} />);
    openRow(container, "run-detail-01");
    const t = item("tool-nodur").textContent ?? "";
    expect(t).toContain("—");
    expect(t).not.toMatch(/null|undefined|NaN/);
  });

  it("renders a null tool name as — alongside its duration", () => {
    const { container } = render(<RunsList runs={runs} />);
    openRow(container, "run-detail-01");
    const t = item("step-text-charlie").textContent ?? "";
    expect(t).toContain("—");
    expect(t).toContain("1 min 0 s");
    expect(t).not.toMatch(/null|undefined|NaN/);
  });
});
