// @vitest-environment jsdom
// FROZEN acceptance tests for HL-015a A2 (render), A3 (text alternative), A4 (states), A5 (reached from run detail).
// Builder may not edit this file. All inline data is SYNTHETIC. Run ids avoid the words null/undefined/NaN.
//
// CONTRACT: src/components/run-swimlane.tsx, default export ({ run }: { run: Run }) => JSX.
//   Root: <figure aria-label="Run swimlane"> (role figure). Inside: one <svg> with the lane names as <text>, and one <rect>
//   per PLACED bar (no other rects), each rect with a <title> that contains the tool name, "step <index>" (case-insensitive,
//   e.g. "step 1"), formatDuration(durationMs) ("—" for null) and the word "error" only for isError === true bars.
//   Text alternative: a <table> with a <tbody> row per bar (placed or not, in any order): lane, step, start, duration, error.
//   It may be behind a disclosure <button> whose name matches /table|data/i; the test clicks it when the table is absent.
//   Null values render "—". Empty state text: "No timed tool calls in this run." (no rects).
//   Unplaced text, exact: "1 tool call without a start time is not drawn." / "<n> tool calls without a start time are not drawn."
//   A5: RunsList (src/components/runs-list.tsx) detail view lazy-loads the figure; it appears after opening a run row.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type { Run, Step, ToolCall } from "../src/lib/ingest";
import { formatDuration } from "../src/lib/format-duration";
import { RunsList } from "../src/components/runs-list";
import RunSwimlane from "../src/components/run-swimlane";

afterEach(cleanup);

const call = (name: string | null, startedAt: string | null, endedAt: string | null, durationMs: number | null, isError: boolean | null): ToolCall => ({
  id: null, name, startedAt, endedAt, durationMs, isError, skill: null,
});
const step = (index: number, toolCalls: ToolCall[]): Step => ({ index, timestamp: null, text: `step-text-${index}`, usage: null, toolCalls, sourceLines: [index + 2] });
function mk(over: Partial<Run>): Run {
  const steps = over.steps ?? [];
  return {
    harness: "claude-code", id: "run-swim-01", startedAt: null, endedAt: null, durationMs: null,
    steps, toolCalls: steps.flatMap((s) => s.toolCalls), usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0, ...over,
  };
}
const T = (s: string) => `2026-10-01T00:00:${s}Z`;

// Same shape as the A1 literal: 4 placed bars (Read ok, Bash error with computed 2.5 s, unknown, Read error with null duration) + 2 unplaced.
const run1 = mk({
  startedAt: T("00.000"),
  steps: [
    step(0, [call("Read", T("01.000"), null, 500, false), call("Bash", T("02.000"), T("04.500"), null, true)]),
    step(1, [call(null, T("03.000"), null, 100, null), call("Read", null, null, 50, false), call("Bash", "not-a-date", null, null, false), call("Read", T("10.000"), null, null, true)]),
  ],
});
const emptyRun = mk({ id: "run-swim-empty", steps: [step(0, [call("Grep", null, null, 7, false)])] });
const noCalls = mk({ id: "run-swim-nocalls", steps: [step(0, [])] });
const allPlaced = mk({ id: "run-swim-placed", startedAt: T("00.000"), steps: [step(0, [call("Edit", T("01.000"), null, 1200, false)])] });
const other = mk({ id: "run-swim-other", harness: "codex", startedAt: T("00.000"), steps: [step(0, [call("OtherOnlyTool", T("01.000"), null, 10, false)])] });

const figure = () => screen.getByRole("figure", { name: "Run swimlane" });
const rects = (f: HTMLElement) => Array.from(f.querySelectorAll("svg rect"));
const titleOf = (e: Element) => (e.querySelector("title")?.textContent ?? "").trim();
function tableRows(f: HTMLElement): HTMLElement[] {
  if (!f.querySelector("table")) {
    const btn = within(f).queryAllByRole("button").find((b) => /table|data/i.test(b.textContent ?? "") || /table|data/i.test(b.getAttribute("aria-label") ?? ""));
    if (btn) fireEvent.click(btn);
  }
  const t = f.querySelector("table");
  if (!t) throw new Error("no data table in the figure (visible or behind a disclosure button named table/data)");
  return Array.from(t.querySelectorAll("tbody tr")) as HTMLElement[];
}

describe("HL-015a A2: the figure and its SVG", () => {
  it("renders a figure named Run swimlane with one svg", () => {
    render(<RunSwimlane run={run1} />);
    expect(figure().querySelectorAll("svg")).toHaveLength(1);
  });
  it("has one labelled row per lane (tool name as text in the svg)", () => {
    render(<RunSwimlane run={run1} />);
    const texts = Array.from(figure().querySelectorAll("svg text")).map((t) => (t.textContent ?? "").trim());
    for (const lane of ["Read", "Bash", "unknown"]) expect(texts, `svg text: ${texts.join("|")}`).toContain(lane);
  });
  it("has exactly one rect per placed bar (4), none for the 2 unplaced calls", () => {
    render(<RunSwimlane run={run1} />);
    expect(rects(figure())).toHaveLength(4);
  });
  it("each rect's title gives tool name, step index and duration (— when null)", () => {
    render(<RunSwimlane run={run1} />);
    const titles = rects(figure()).map(titleOf);
    expect(titles[0]).toMatch(/Read/); expect(titles[0]).toMatch(/step\s*0\b/i); expect(titles[0]).toContain(formatDuration(500));
    expect(titles[1]).toMatch(/Bash/); expect(titles[1]).toMatch(/step\s*0\b/i); expect(titles[1]).toContain(formatDuration(2500));
    expect(titles[2]).toMatch(/unknown/); expect(titles[2]).toMatch(/step\s*1\b/i); expect(titles[2]).toContain(formatDuration(100));
    expect(titles[3]).toMatch(/Read/); expect(titles[3]).toMatch(/step\s*1\b/i); expect(titles[3]).toContain("—");
  });
  it("error bars say error in the title and ok bars do not; error is not by colour alone (a marker or pattern exists)", () => {
    render(<RunSwimlane run={run1} />);
    const rs = rects(figure());
    const titles = rs.map(titleOf);
    expect(titles.map((t) => /error/i.test(t))).toEqual([false, true, false, true]);
    // Non-colour cue: the svg holds something beyond the 4 bar rects for errors (a <pattern>, <path>, <line>, <polygon>, <circle> or extra <text>),
    // and the error bars differ from ok bars in an attribute other than fill/stroke colour alone.
    const f = figure();
    const marker = f.querySelectorAll("svg pattern, svg path, svg line, svg polygon, svg circle, svg use").length;
    const attrs = (e: Element) => Array.from(e.attributes).map((a) => a.name).filter((n) => !["x", "y", "width", "height", "fill", "stroke", "style", "class", "data-testid", "key"].includes(n) && n !== "style").sort().join(",");
    const fillOf = (e: Element) => e.getAttribute("fill") ?? "";
    const patternFill = (e: Element) => /url\(/.test(fillOf(e)) || e.hasAttribute("stroke-dasharray") || e.hasAttribute("mask");
    const differs = marker > 0 || patternFill(rs[1]) || patternFill(rs[3]) || attrs(rs[1]) !== attrs(rs[0]);
    expect(differs, "error bars must differ by more than colour").toBe(true);
  });
  it("does not render null, undefined or NaN text", () => {
    render(<RunSwimlane run={run1} />);
    expect(figure().textContent ?? "").not.toMatch(/\bnull\b|undefined|NaN/);
  });
});

describe("HL-015a A3: data table text alternative", () => {
  it("lists every bar (6, placed or not) with lane, step, start, duration, error; nulls render —", () => {
    render(<RunSwimlane run={run1} />);
    const rows = tableRows(figure());
    expect(rows).toHaveLength(6);
    const texts = rows.map((r) => r.textContent ?? "");
    expect(texts.filter((t) => /error/i.test(t))).toHaveLength(2);
    // rows with a null start or duration: c4 (start), c5 (start, duration), c6 (duration)
    expect(texts.filter((t) => t.includes("—"))).toHaveLength(3);
    expect(texts.join(" ")).not.toMatch(/\bnull\b|undefined|NaN/);
    expect(texts.some((t) => t.includes(formatDuration(2500)))).toBe(true);
    expect(texts.some((t) => t.includes("unknown"))).toBe(true);
  });
  it("has column headers for lane, step, start, duration and error", () => {
    render(<RunSwimlane run={run1} />);
    tableRows(figure());
    const heads = Array.from(figure().querySelectorAll("table thead th")).map((h) => (h.textContent ?? "").toLowerCase());
    for (const w of [/lane|tool/, /step/, /start/, /duration/, /error/]) expect(heads.some((h) => w.test(h)), `headers: ${heads.join("|")}`).toBe(true);
  });
});

describe("HL-015a A4: empty and partial states", () => {
  it("a run with no placed bars shows the empty text, no rects, and the unplaced note (1)", () => {
    render(<RunSwimlane run={emptyRun} />);
    expect(screen.getByText("No timed tool calls in this run.")).toBeTruthy();
    expect(rects(figure())).toHaveLength(0);
    expect(screen.getByText("1 tool call without a start time is not drawn.")).toBeTruthy();
  });
  it("a run with no tool calls shows the empty text and no unplaced note", () => {
    render(<RunSwimlane run={noCalls} />);
    expect(screen.getByText("No timed tool calls in this run.")).toBeTruthy();
    expect(screen.queryByText(/without a start time/)).toBeNull();
  });
  it("partial: plural note for 2 unplaced, and the placed bars are still drawn", () => {
    render(<RunSwimlane run={run1} />);
    expect(screen.getByText("2 tool calls without a start time are not drawn.")).toBeTruthy();
    expect(screen.queryByText("No timed tool calls in this run.")).toBeNull();
    expect(rects(figure())).toHaveLength(4);
  });
  it("a fully placed run shows neither message", () => {
    render(<RunSwimlane run={allPlaced} />);
    expect(screen.queryByText(/without a start time/)).toBeNull();
    expect(screen.queryByText("No timed tool calls in this run.")).toBeNull();
    expect(rects(figure())).toHaveLength(1);
  });
});

describe("HL-015a A5: reached from the run detail", () => {
  const bodyRows = (c: HTMLElement) => Array.from(c.querySelectorAll("tbody tr")) as HTMLElement[];
  function openRow(container: HTMLElement, id: string) {
    const row = bodyRows(container).find((r) => r.textContent?.includes(id));
    if (!row) throw new Error(`no row for ${id}`);
    const ctl = within(row).queryAllByRole("button")[0] ?? within(row).queryAllByRole("link")[0];
    if (!ctl) throw new Error(`row ${id} has no control`);
    fireEvent.click(ctl);
  }
  it("no swimlane on the list; opening a run shows that run's swimlane (lazy, so await it)", async () => {
    const { container } = render(<RunsList runs={[allPlaced, other]} />);
    expect(screen.queryByRole("figure", { name: "Run swimlane" })).toBeNull();
    openRow(container, "run-swim-placed");
    const f = await screen.findByRole("figure", { name: "Run swimlane" }, { timeout: 10000 });
    expect(rects(f)).toHaveLength(1);
    expect(f.textContent ?? "").toContain("Edit");
    expect(f.textContent ?? "").not.toContain("OtherOnlyTool");
  }, 20000);
  it("opening the other run shows the other run's lanes", async () => {
    const { container } = render(<RunsList runs={[allPlaced, other]} />);
    openRow(container, "run-swim-other");
    const f = await screen.findByRole("figure", { name: "Run swimlane" }, { timeout: 10000 });
    expect(f.textContent ?? "").toContain("OtherOnlyTool");
    expect(f.textContent ?? "").not.toContain("Edit");
  }, 20000);
});
