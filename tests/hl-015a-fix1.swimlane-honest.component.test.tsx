// @vitest-environment jsdom
// FROZEN fix1 tests for HL-015a (reviewer r1 required fixes 2 and 3). Builder may not edit this file. All data is SYNTHETIC.
//
// Fix 2 (axis unit): the figure must not claim seconds while ticks use formatDuration ("0 ms", "2.0 s", "1 min 0 s").
//   Contract: no "axis in s" text anywhere in the figure; the SVG holds a visible <text> axis title that mentions "run start"
//   and does not name a single unit (no "in s", "(s)", "seconds", "in ms").
// Fix 3 (negative start): a call that starts before the run origin shows its true offset.
//   Contract: bar <title> and the data table start cell contain "<formatDuration(offset)> before run start" (1000 ms -> "1.0 s before run start",
//   per the existing formatDuration); the text "0 ms" never stands in for it. No bar rect is drawn left of the lane-label gutter, where the
//   gutter edge is the largest `x` attribute of the lane-name <text> elements (they are end-anchored at the gutter; the plot starts at or right of it).
//   The domain may extend left, or the bar may be clipped; both satisfy this.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type { Run, Step, ToolCall } from "../src/lib/ingest";
import RunSwimlane from "../src/components/run-swimlane";

afterEach(cleanup);

const call = (name: string | null, startedAt: string | null, durationMs: number | null): ToolCall => ({
  id: null, name, startedAt, endedAt: null, durationMs, isError: false, skill: null,
});
const step = (index: number, toolCalls: ToolCall[]): Step => ({ index, timestamp: null, text: `step-text-${index}`, usage: null, toolCalls, sourceLines: [index + 2] });
const T = (s: string) => `2026-10-01T00:00:${s}Z`;
function mk(steps: Step[]): Run {
  return {
    harness: "claude-code", id: "run-swim-fix1", startedAt: T("05.000"), endedAt: null, durationMs: null,
    steps, toolCalls: steps.flatMap((s) => s.toolCalls), usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0,
  };
}
// Run origin 05.000. Read starts 1000 ms BEFORE it, Bash at +1000 ms, Edit at +9000 ms.
const negRun = mk([step(0, [call("Read", T("04.000"), 300), call("Bash", T("06.000"), 500), call("Edit", T("14.000"), 700)])]);

const figure = () => screen.getByRole("figure", { name: "Run swimlane" });
const rects = (f: HTMLElement) => Array.from(f.querySelectorAll("svg rect"));
const titleOf = (e: Element) => (e.querySelector("title")?.textContent ?? "").trim();
const svgTexts = (f: HTMLElement) => Array.from(f.querySelectorAll("svg text")).map((t) => (t.textContent ?? "").trim());
function tableRows(f: HTMLElement): HTMLElement[] {
  if (!f.querySelector("table")) {
    const btn = within(f).queryAllByRole("button").find((b) => /table|data/i.test(b.textContent ?? ""));
    if (btn) fireEvent.click(btn);
  }
  return Array.from(f.querySelectorAll("table tbody tr")) as HTMLElement[];
}

describe("HL-015a fix1 / required fix 2: the axis does not claim a unit the ticks do not use", () => {
  it("the figure never says 'axis in s'", () => {
    render(<RunSwimlane run={negRun} />);
    expect(figure().textContent ?? "").not.toMatch(/axis in s\b/i);
  });
  it("the svg has a visible axis title that mentions the run start", () => {
    render(<RunSwimlane run={negRun} />);
    const texts = svgTexts(figure());
    expect(texts.some((t) => /run start/i.test(t)), `svg text: ${texts.join("|")}`).toBe(true);
  });
  it("the axis title does not name a single unit that the mixed-unit ticks contradict", () => {
    render(<RunSwimlane run={negRun} />);
    const title = svgTexts(figure()).find((t) => /run start/i.test(t)) ?? "";
    expect(title, "axis title missing").not.toBe("");
    expect(title).not.toMatch(/\bin\s+(s|sec|secs|seconds|ms)\b|\((s|ms|sec|seconds)\)|\bseconds\b/i);
  });
});

describe("HL-015a fix1 / required fix 3: a start before the run origin shows its true value", () => {
  it("the bar title says '1 s before run start' for the call 1000 ms early, never '0 ms'", () => {
    render(<RunSwimlane run={negRun} />);
    const t = titleOf(rects(figure())[0]);
    expect(t).toMatch(/Read/);
    expect(t).toMatch(/\b1(\.0)? s before run start/);
    expect(t).not.toMatch(/start 0 ms/);
  });
  it("the data table start cell says '1 s before run start' for that call and plain values for the others", () => {
    render(<RunSwimlane run={negRun} />);
    const rows = tableRows(figure());
    expect(rows).toHaveLength(3);
    const read = rows.find((r) => /Read/.test(r.textContent ?? ""));
    expect(read?.textContent ?? "").toMatch(/\b1(\.0)? s before run start/);
    expect(read?.textContent ?? "").not.toMatch(/\b0 ms\b/);
    expect(rows.filter((r) => /before run start/i.test(r.textContent ?? ""))).toHaveLength(1);
  });
  it("no bar is drawn inside the lane-label gutter (every rect x is at or right of the lane-name text x)", () => {
    render(<RunSwimlane run={negRun} />);
    const f = figure();
    const lanes = new Set(["Read", "Bash", "Edit"]);
    const labelXs = Array.from(f.querySelectorAll("svg text")).filter((t) => lanes.has((t.textContent ?? "").trim())).map((t) => Number(t.getAttribute("x")));
    expect(labelXs).toHaveLength(3);
    const gutter = Math.max(...labelXs);
    const xs = rects(f).map((r) => Number(r.getAttribute("x")));
    expect(xs).toHaveLength(3);
    for (const x of xs) { expect(Number.isFinite(x)).toBe(true); expect(x).toBeGreaterThanOrEqual(gutter); }
  });
});
