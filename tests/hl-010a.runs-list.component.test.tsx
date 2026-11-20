// @vitest-environment jsdom
// FROZEN acceptance tests for HL-010a (RunsList component). Builder may not edit this file.
// All inline data is SYNTHETIC.
//
// CONTRACT: src/components/runs-list.tsx
//   export function RunsList(props: { runs: Run[] }): JSX.Element   (named export)
//   - a <table> with a <caption> (accessible name of the table) containing "runs" (case-insensitive),
//     with <th> column headers for: run id, harness, started, duration, steps, tool calls, errors
//   - one <tbody> row per run, in toRunRows order (newest first, null startedAt last)
//   - a null id/startedAt/durationMs renders the em dash "—" in its cell (never "null", "0" or blank)
//   - a harness filter named All / Claude Code / Codex: a radio group (role=radio) OR buttons
//     (role=button); it is a real focusable control (not a div with onClick); choosing Codex
//     shows only codex rows, Claude Code only claude-code rows, All shows both
//   - empty list: no <table>, and an element with role="status" or text /no runs/i
// Keyboard activation (Tab, Enter/Space/arrows) is checked in e2e/hl-010a.runs-list.spec.ts, since
// jsdom does not implement native key activation.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type { Run, ToolCall } from "../src/lib/ingest";
import { RunsList } from "../src/components/runs-list";

afterEach(cleanup);

const call = (isError: boolean | null): ToolCall => ({ id: null, name: "t", startedAt: null, endedAt: null, durationMs: null, isError });
const step = (index: number) => ({ index, timestamp: null, text: null, usage: null, toolCalls: [], sourceLines: [index + 2] });
function mk(over: Partial<Run>): Run {
  return {
    harness: "claude-code", id: "id", startedAt: null, endedAt: null, durationMs: null,
    steps: [], toolCalls: [], usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0, ...over,
  };
}
const runs: Run[] = [
  mk({ id: "cc-old", harness: "claude-code", startedAt: "2026-10-01T00:00:00.000Z", durationMs: 90000,
    steps: Array.from({ length: 11 }, (_, i) => step(i)), toolCalls: [call(true), call(true), call(false), call(null), call(false)] }),
  mk({ id: "cx-new", harness: "codex", startedAt: "2026-10-09T00:00:00.000Z", durationMs: 5000, steps: [step(0)], toolCalls: [] }),
  mk({ id: null, harness: "codex", startedAt: null, durationMs: null }),
];

const bodyRows = (c: HTMLElement) => Array.from(c.querySelectorAll("tbody tr")) as HTMLElement[];
const filter = (name: RegExp) => {
  const el = screen.queryByRole("radio", { name }) ?? screen.queryByRole("button", { name });
  if (!el) throw new Error(`no radio or button named ${name}`);
  return el;
};

describe("HL-010a RunsList", () => {
  it("renders a table with a caption mentioning runs and the seven column headers", () => {
    render(<RunsList runs={runs} />);
    const table = screen.getByRole("table", { name: /runs/i });
    expect(table.querySelector("caption")).not.toBeNull();
    const heads = within(table).getAllByRole("columnheader").map((h) => h.textContent?.toLowerCase() ?? "");
    for (const re of [/\bid\b|run/, /harness/, /started/, /duration/, /steps/, /tool/, /error/]) {
      expect(heads.some((h) => re.test(h)), `header ${re}`).toBe(true);
    }
  });

  it("renders one body row per run, newest first, null startedAt last", () => {
    const { container } = render(<RunsList runs={runs} />);
    const rows = bodyRows(container);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("cx-new");
    expect(rows[1].textContent).toContain("cc-old");
  });

  it("shows step, tool-call and error counts in the row", () => {
    const { container } = render(<RunsList runs={runs} />);
    const cells = Array.from(bodyRows(container)[1].querySelectorAll("td,th")).map((c) => c.textContent?.trim());
    expect(cells).toContain("11");  // stepCount
    expect(cells).toContain("5");   // toolCallCount
    expect(cells).toContain("2");   // errorCount (only isError === true)
  });

  it("renders an em dash for null cells, never 'null'", () => {
    const { container } = render(<RunsList runs={runs} />);
    const last = bodyRows(container)[2];
    const cells = Array.from(last.querySelectorAll("td,th")).map((c) => c.textContent?.trim());
    expect(cells.filter((c) => c === "—").length).toBeGreaterThanOrEqual(3); // id, startedAt, durationMs
    expect(last.textContent).not.toMatch(/null|undefined|NaN/);
  });

  it("shows an empty state and no table for an empty list", () => {
    render(<RunsList runs={[]} />);
    expect(screen.queryByRole("table")).toBeNull();
    const status = screen.queryByRole("status");
    expect(status !== null || screen.queryByText(/no runs/i) !== null).toBe(true);
  });

  it("harness filter (All / Claude Code / Codex) narrows the rows", () => {
    const { container } = render(<RunsList runs={runs} />);
    fireEvent.click(filter(/^codex$/i));
    expect(bodyRows(container)).toHaveLength(2);
    expect(container.textContent).not.toContain("cc-old");
    fireEvent.click(filter(/claude code/i));
    expect(bodyRows(container)).toHaveLength(1);
    expect(container.textContent).toContain("cc-old");
    fireEvent.click(filter(/^all$/i));
    expect(bodyRows(container)).toHaveLength(3);
  });

  it("filter controls are real, focusable, enabled form controls", () => {
    render(<RunsList runs={runs} />);
    for (const re of [/^all$/i, /claude code/i, /^codex$/i]) {
      const el = filter(re) as HTMLElement;
      expect(["INPUT", "BUTTON"]).toContain(el.tagName);
      expect((el as HTMLInputElement).disabled).toBe(false);
      expect(el.tabIndex).toBeGreaterThanOrEqual(0);
      el.focus();
      expect(document.activeElement).toBe(el);
    }
  });
});
