// @vitest-environment jsdom
// FROZEN fix-freeze tests for HL-015b fix1, item 1 (reviews/2026-11-12T0039-HL-015b-r1.md finding 1). Builder may not edit this file.
// All inline data is SYNTHETIC.
// CONTRACT: the current (scrubbed) bar keeps its own encoding. When the current bar is an error, its <rect> has the same fill and the
//   same stroke and stroke-width as a NON-current error bar (the hatch pattern url and var(--destructive)). The current-step emphasis is a
//   SEPARATE element: exactly one element in the svg carrying data-current-highlight="true", which is not a <rect> (HL-015a/015b frozen
//   tests fix the svg at one <rect> per placed bar), is not inside <pattern>/<defs>, has an explicit fill of "none" or "transparent", has a visible stroke (not "none", stroke-width > 0), and moves with
//   the step (its attributes differ between two positions). The current non-error bar keeps fill var(--chart-1).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type { Run, Step, ToolCall } from "../src/lib/ingest";
import RunSwimlane from "../src/components/run-swimlane";

afterEach(cleanup);

const call = (name: string | null, startedAt: string | null, endedAt: string | null, durationMs: number | null, isError: boolean | null): ToolCall => ({
  id: null, name, startedAt, endedAt, durationMs, isError, skill: null,
});
const step = (index: number, toolCalls: ToolCall[]): Step => ({ index, timestamp: null, text: `step-text-${index}`, usage: null, toolCalls, sourceLines: [index + 2] });
const T = (s: string) => `2026-10-01T00:00:${s}Z`;
// 4 placed bars: [0] Read ok, [1] Bash error, [2] Edit ok, [3] Read error.
const steps = [
  step(0, [call("Read", T("01.000"), null, 500, false), call("Bash", T("02.000"), T("04.500"), null, true)]),
  step(1, [call("Edit", T("06.000"), null, 100, false), call("Read", T("10.000"), null, 800, true)]),
];
const run: Run = {
  harness: "claude-code", id: "run-fix1-01", startedAt: T("00.000"), endedAt: null, durationMs: null,
  steps, toolCalls: steps.flatMap((s) => s.toolCalls), usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0,
};

const figure = () => screen.getByRole("figure", { name: "Run swimlane" });
const slider = () => within(figure()).getByRole("slider", { name: /scrub/i }) as HTMLInputElement;
const rects = () => Array.from(figure().querySelectorAll("svg rect"));
const setPos = (n: number) => fireEvent.change(slider(), { target: { value: String(n) } });
const hl = () => Array.from(figure().querySelectorAll('svg [data-current-highlight="true"]'));
const look = (e: Element) => ({ fill: e.getAttribute("fill"), stroke: e.getAttribute("stroke"), sw: e.getAttribute("stroke-width") });

describe("HL-015b fix1: the current bar keeps its error encoding", () => {
  it("the current error bar has the same fill, stroke and stroke-width as a non-current error bar", () => {
    render(<RunSwimlane run={run} />);
    setPos(1); // Bash error is current; rect 3 (Read error) is not
    const cur = look(rects()[1]);
    const other = look(rects()[3]);
    expect(other.stroke).toBe("var(--destructive)");
    expect(other.fill).toMatch(/^url\(#/);
    expect(cur).toEqual(other);
  });
  it("it holds at the last position too (Read error current, Bash error not)", () => {
    render(<RunSwimlane run={run} />);
    setPos(3);
    expect(look(rects()[3])).toEqual(look(rects()[1]));
    expect(look(rects()[3]).stroke).toBe("var(--destructive)");
  });
  it("the current non-error bar keeps the ordinary bar fill and is still the one aria-current rect", () => {
    render(<RunSwimlane run={run} />);
    setPos(2);
    expect(rects()[2].getAttribute("fill")).toBe("var(--chart-1)");
    expect(rects()[2].getAttribute("aria-current") === "step" || rects()[2].getAttribute("data-current") === "true").toBe(true);
    expect(rects()).toHaveLength(4);
  });
});

describe("HL-015b fix1: the highlight is a separate element", () => {
  it("exactly one element has data-current-highlight, it is not a rect, not in a pattern/defs, unfilled and stroked", () => {
    render(<RunSwimlane run={run} />);
    for (const p of [0, 1, 3]) {
      setPos(p);
      const h = hl();
      expect(h, `position ${p}`).toHaveLength(1);
      const e = h[0];
      expect(e.tagName.toLowerCase()).not.toBe("rect");
      expect(e.closest("pattern, defs")).toBeNull();
      expect(["none", "transparent"]).toContain(e.getAttribute("fill"));
      const stroke = e.getAttribute("stroke");
      expect(stroke).not.toBeNull();
      expect(stroke).not.toBe("none");
      expect(Number(e.getAttribute("stroke-width"))).toBeGreaterThan(0);
    }
  });
  it("the highlight moves with the step", () => {
    render(<RunSwimlane run={run} />);
    const sig = () => {
      const e = hl()[0];
      return Array.from(e.attributes).filter((a) => a.name !== "data-current-highlight").map((a) => `${a.name}=${a.value}`).sort().join("|");
    };
    setPos(0);
    const a = sig();
    setPos(3);
    expect(sig()).not.toBe(a);
  });
  it("no highlight element is drawn when there is no scrubber (no placed bars)", () => {
    const empty: Run = { ...run, id: "run-fix1-empty", steps: [step(0, [call("Grep", null, null, 7, false)])], toolCalls: [] };
    render(<RunSwimlane run={empty} />);
    expect(hl()).toHaveLength(0);
  });
});
