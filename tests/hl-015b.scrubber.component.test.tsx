// @vitest-environment jsdom
// FROZEN acceptance tests for HL-015b B2 (range control), B3 (prev/next, keys), B4 (highlight), B5 (live region), B6 (empty).
// Builder may not edit this file. All inline data is SYNTHETIC. Run ids avoid the words null/undefined/NaN.
//
// CONTRACT (inside the existing <figure aria-label="Run swimlane"> from src/components/run-swimlane.tsx; no new route):
//   Range: one <input type="range"> (role slider) named /scrub/i (e.g. "Scrub tool calls"), min=0, max=n-1, step=1, where n = the
//     number of PLACED bars. value is the current 0-based position; it starts at 0.
//   Buttons: exactly named "Previous step" and "Next step"; disabled at position 0 / n-1 respectively.
//   Keys on the range: Home -> position 0, End -> position n-1 (handled by the component; jsdom has no native range keys).
//     ArrowLeft/ArrowRight are native range behaviour and are checked in the browser spec, not here.
//   Highlight: among the <rect>s in the svg (one per placed bar, in buildSwimlane order) exactly one has aria-current="step" or
//     data-current="true"; it is the current position's rect. It is also marked by more than colour: either a stroke-width greater
//     than every other rect's, or an extra shape (circle, polygon, use, or path outside a <pattern>) in the svg.
//   Live region: role="status" or aria-live="polite" element whose trimmed text is exactly
//     "Step <pos+1> of <n>: <tool>, <duration>, <ok|error>"  with <tool> = name or "unknown", <duration> = formatDuration(ms)
//     (null -> "—"), never null/undefined/NaN.
//   Empty (no placed bars): no slider, no "Previous step"/"Next step" buttons; the existing empty text stands.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type { Run, Step, ToolCall } from "../src/lib/ingest";
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
    harness: "claude-code", id: "run-scrub-01", startedAt: null, endedAt: null, durationMs: null,
    steps, toolCalls: steps.flatMap((s) => s.toolCalls), usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0, ...over,
  };
}
const T = (s: string) => `2026-10-01T00:00:${s}Z`;

// 4 placed bars (Read ok 500 ms; Bash error computed 2.5 s; null-name 100 ms ok; Read error with null duration) + 2 unplaced.
const run1 = mk({
  startedAt: T("00.000"),
  steps: [
    step(0, [call("Read", T("01.000"), null, 500, false), call("Bash", T("02.000"), T("04.500"), null, true)]),
    step(1, [call(null, T("03.000"), null, 100, null), call("Read", null, null, 50, false), call("Bash", "not-a-date", null, null, false), call("Read", T("10.000"), null, null, true)]),
  ],
});
const READOUT = [
  "Step 1 of 4: Read, 500 ms, ok",
  "Step 2 of 4: Bash, 2.5 s, error",
  "Step 3 of 4: unknown, 100 ms, ok",
  "Step 4 of 4: Read, —, error",
];
const emptyRun = mk({ id: "run-scrub-empty", steps: [step(0, [call("Grep", null, null, 7, false)])] });
const noCalls = mk({ id: "run-scrub-nocalls", steps: [step(0, [])] });
const one = mk({ id: "run-scrub-one", startedAt: T("00.000"), steps: [step(0, [call("Edit", T("01.000"), null, 1200, false)])] });
const other = mk({ id: "run-scrub-other", harness: "codex", startedAt: T("00.000"), steps: [step(0, [call("OtherOnlyTool", T("01.000"), null, 10, false), call("Second", T("02.000"), null, 20, false)])] });

const figure = () => screen.getByRole("figure", { name: "Run swimlane" });
const slider = () => within(figure()).getByRole("slider", { name: /scrub/i }) as HTMLInputElement;
const prev = () => within(figure()).getByRole("button", { name: "Previous step" }) as HTMLButtonElement;
const next = () => within(figure()).getByRole("button", { name: "Next step" }) as HTMLButtonElement;
const rects = () => Array.from(figure().querySelectorAll("svg rect"));
const isCurrent = (e: Element) => e.getAttribute("aria-current") === "step" || e.getAttribute("data-current") === "true";
function live(): string {
  const els = Array.from(figure().querySelectorAll('[role="status"], [aria-live="polite"]')).filter((e) => /^\s*Step\s+\d+\s+of\s+\d+/.test(e.textContent ?? ""));
  if (els.length !== 1) throw new Error(`expected exactly one polite live region reading "Step N of M…", found ${els.length}`);
  return (els[0].textContent ?? "").trim();
}
const setPos = (n: number) => fireEvent.change(slider(), { target: { value: String(n) } });

describe("HL-015b B2: range control", () => {
  it("has one range input named like 'Scrub tool calls' with min 0, max n-1, step 1, starting at 0", () => {
    render(<RunSwimlane run={run1} />);
    expect(within(figure()).getAllByRole("slider")).toHaveLength(1);
    const s = slider();
    expect(s.type).toBe("range");
    expect(s.getAttribute("min")).toBe("0");
    expect(s.getAttribute("max")).toBe("3");
    expect(s.getAttribute("step")).toBe("1");
    expect(s.value).toBe("0");
  });
  it("changing the range moves the current step (readout and highlight)", () => {
    render(<RunSwimlane run={run1} />);
    setPos(2);
    expect(slider().value).toBe("2");
    expect(live()).toBe(READOUT[2]);
    expect(rects().findIndex(isCurrent)).toBe(2);
    setPos(1);
    expect(live()).toBe(READOUT[1]);
    expect(rects().findIndex(isCurrent)).toBe(1);
  });
  it("max follows the placed-bar count of a different run (1 placed bar -> max 0)", () => {
    render(<RunSwimlane run={one} />);
    expect(slider().getAttribute("max")).toBe("0");
    expect(slider().getAttribute("min")).toBe("0");
  });
});

describe("HL-015b B3: previous / next / Home / End", () => {
  it("Previous step is disabled at the start, Next step enabled", () => {
    render(<RunSwimlane run={run1} />);
    expect(prev().disabled).toBe(true);
    expect(next().disabled).toBe(false);
  });
  it("Next step steps forward through every call in order and is disabled at the end", () => {
    render(<RunSwimlane run={run1} />);
    for (let i = 0; i < 4; i++) {
      expect(live()).toBe(READOUT[i]);
      expect(slider().value).toBe(String(i));
      if (i < 3) fireEvent.click(next());
    }
    expect(next().disabled).toBe(true);
    expect(prev().disabled).toBe(false);
  });
  it("Previous step steps back and the range follows", () => {
    render(<RunSwimlane run={run1} />);
    setPos(3);
    fireEvent.click(prev());
    expect(slider().value).toBe("2");
    expect(live()).toBe(READOUT[2]);
    fireEvent.click(prev()); fireEvent.click(prev());
    expect(live()).toBe(READOUT[0]);
    expect(prev().disabled).toBe(true);
  });
  it("Home goes to the first step and End to the last, from the range", () => {
    render(<RunSwimlane run={run1} />);
    setPos(2);
    fireEvent.keyDown(slider(), { key: "End" });
    expect(slider().value).toBe("3");
    expect(live()).toBe(READOUT[3]);
    expect(rects().findIndex(isCurrent)).toBe(3);
    fireEvent.keyDown(slider(), { key: "Home" });
    expect(slider().value).toBe("0");
    expect(live()).toBe(READOUT[0]);
    expect(rects().findIndex(isCurrent)).toBe(0);
  });
  it("with a single placed bar both buttons are disabled", () => {
    render(<RunSwimlane run={one} />);
    expect(prev().disabled).toBe(true);
    expect(next().disabled).toBe(true);
    expect(live()).toBe("Step 1 of 1: Edit, 1.2 s, ok");
  });
});

describe("HL-015b B4: highlighted bar", () => {
  it("exactly one rect is current, and it starts on the first bar", () => {
    render(<RunSwimlane run={run1} />);
    expect(rects()).toHaveLength(4);
    expect(rects().filter(isCurrent)).toHaveLength(1);
    expect(rects().findIndex(isCurrent)).toBe(0);
  });
  it("the current rect follows Next and Previous, still exactly one at a time", () => {
    render(<RunSwimlane run={run1} />);
    for (const want of [1, 2, 3]) {
      fireEvent.click(next());
      expect(rects().filter(isCurrent)).toHaveLength(1);
      expect(rects().findIndex(isCurrent)).toBe(want);
    }
    fireEvent.click(prev());
    expect(rects().filter(isCurrent)).toHaveLength(1);
    expect(rects().findIndex(isCurrent)).toBe(2);
  });
  it("the current bar is shown by more than colour (thicker outline than every other bar, or an extra marker shape)", () => {
    render(<RunSwimlane run={run1} />);
    for (const pos of [0, 1, 2, 3]) {
      setPos(pos);
      const rs = rects();
      const cur = rs[pos];
      const sw = (e: Element) => parseFloat(e.getAttribute("stroke-width") ?? "0") || 0;
      const thicker = rs.filter((e) => e !== cur).every((e) => sw(cur) > sw(e));
      const marker = Array.from(figure().querySelectorAll("svg circle, svg polygon, svg use, svg path")).filter((e) => !e.closest("pattern")).length > 0;
      expect(thicker || marker, `position ${pos}: stroke-width ${rs.map(sw).join(",")}; no extra marker shape`).toBe(true);
    }
  });
  it("the rects keep their 015a titles (tool name, step, duration)", () => {
    render(<RunSwimlane run={run1} />);
    fireEvent.click(next());
    const t = (e: Element) => (e.querySelector("title")?.textContent ?? "").trim();
    expect(t(rects()[1])).toMatch(/Bash/);
    expect(t(rects()[1])).toMatch(/error/i);
  });
});

describe("HL-015b B5: live region", () => {
  it("is polite, reads 'Step N of M: tool, duration, ok|error' at every position, and never null/undefined/NaN", () => {
    render(<RunSwimlane run={run1} />);
    const el = () => Array.from(figure().querySelectorAll('[role="status"], [aria-live="polite"]')).find((e) => /^\s*Step\s/.test(e.textContent ?? "")) as Element;
    for (let i = 0; i < 4; i++) {
      setPos(i);
      expect(live()).toBe(READOUT[i]);
      expect(live()).not.toMatch(/\bnull\b|undefined|NaN/);
      const polite = el().getAttribute("role") === "status" || el().getAttribute("aria-live") === "polite";
      expect(polite).toBe(true);
      expect(el().getAttribute("aria-live")).not.toBe("assertive");
    }
  });
  it("a null tool reads 'unknown' and a null duration reads '—'", () => {
    render(<RunSwimlane run={run1} />);
    setPos(2);
    expect(live()).toContain("unknown");
    setPos(3);
    expect(live()).toContain(", —,");
  });
  it("the whole figure never renders null, undefined or NaN as text", () => {
    render(<RunSwimlane run={run1} />);
    setPos(3);
    expect(figure().textContent ?? "").not.toMatch(/\bnull\b|undefined|NaN/);
  });
});

describe("HL-015b B6: empty states render no scrubber", () => {
  for (const [label, r] of [["only unplaced calls", emptyRun], ["no tool calls", noCalls]] as const) {
    it(`${label}: no slider, no Previous/Next buttons, existing empty text stands`, () => {
      render(<RunSwimlane run={r} />);
      expect(within(figure()).queryAllByRole("slider")).toHaveLength(0);
      expect(within(figure()).queryByRole("button", { name: "Previous step" })).toBeNull();
      expect(within(figure()).queryByRole("button", { name: "Next step" })).toBeNull();
      expect(figure().querySelectorAll('input[type="range"]')).toHaveLength(0);
      if (r === emptyRun) expect(figure().textContent ?? "").toContain("No timed tool calls in this run.");
    });
  }
});

describe("HL-015b: reached from the run detail", () => {
  it("opening a run shows its scrubber, sized to that run", async () => {
    const { container } = render(<RunsList runs={[one, other]} />);
    const row = (Array.from(container.querySelectorAll("tbody tr")) as HTMLElement[]).find((r) => r.textContent?.includes("run-scrub-other"));
    if (!row) throw new Error("no row for run-scrub-other");
    fireEvent.click(within(row).queryAllByRole("button")[0] ?? within(row).queryAllByRole("link")[0]);
    await screen.findByRole("figure", { name: "Run swimlane" }, { timeout: 10000 });
    expect(slider().getAttribute("max")).toBe("1");
    expect(live()).toBe("Step 1 of 2: OtherOnlyTool, 10 ms, ok");
    fireEvent.click(next());
    expect(live()).toBe("Step 2 of 2: Second, 20 ms, ok");
  }, 20000);
});
