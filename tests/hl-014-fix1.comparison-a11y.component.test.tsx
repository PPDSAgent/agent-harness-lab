// @vitest-environment jsdom
// FROZEN fix1 tests for HL-014 (reviews/2026-11-11T0042-HL-014-r1.md, required fixes 1-3, structure only). Builder may not edit this file.
// The real-layout checks (axe, sticky labels at 390 px, hint visibility, clipping) are in e2e/hl-014-fix1.comparison-390.spec.ts.
// All inline data is SYNTHETIC. Strings avoid the words null/undefined/NaN on purpose.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import HarnessComparison from "../src/components/harness-comparison";
import type { Run } from "../src/lib/ingest";

afterEach(cleanup);

const RUNS: Run[] = [
  {
    harness: "claude-code", id: "run-a", startedAt: null, endedAt: null, durationMs: 2000,
    steps: [], toolCalls: [], usage: null, verdicts: [], claims: [], recordCount: 0, droppedCount: 0,
  },
];

const text = (e: Element) => (e.textContent ?? "").trim();
const cls = (e: Element) => e.getAttribute("class") ?? "";

function setup() {
  const { container } = render(<HarnessComparison runs={RUNS} />);
  const root = screen.getByRole("region", { name: /compare harnesses/i });
  const table = root.querySelector("table") as HTMLTableElement;
  let scroller: HTMLElement | null = table.parentElement;
  while (scroller && root.contains(scroller) && !/\boverflow-x-(auto|scroll)\b/.test(cls(scroller))) scroller = scroller.parentElement;
  if (!scroller || scroller === root) throw new Error("no overflow-x scroller inside the section");
  return { container, root, table, scroller };
}

describe("HL-014 fix1.1: the scroller is a focusable, named region", () => {
  it("has tabindex 0, role region and a name that does not match /compare harnesses/i", () => {
    const { scroller, table } = setup();
    expect(scroller.contains(table)).toBe(true);
    expect(scroller.getAttribute("tabindex")).toBe("0");
    expect(scroller.getAttribute("role")).toBe("region");
    const label = scroller.getAttribute("aria-label") ?? "";
    expect(label.trim().length).toBeGreaterThan(0);
    expect(label).not.toMatch(/compare harnesses/i);
  });

  it("leaves exactly one region named /compare harnesses/i (the frozen section() query stays unambiguous)", () => {
    setup();
    expect(screen.getAllByRole("region", { name: /compare harnesses/i })).toHaveLength(1);
    expect(screen.getAllByRole("region").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a focus ring when focused by keyboard (focus-visible outline class)", () => {
    const { scroller } = setup();
    expect(cls(scroller)).toMatch(/focus-visible:outline/);
  });
});

describe("HL-014 fix1.2: row labels stay visible; the scroll is discoverable", () => {
  it("the Metric column header and every row header are sticky left-0 with an opaque background", () => {
    const { table } = setup();
    const heads = [table.querySelector("thead th")!, ...Array.from(table.querySelectorAll("tbody th"))];
    expect(heads).toHaveLength(8);
    for (const th of heads) {
      const c = cls(th);
      expect(c, `${text(th)} must be sticky`).toMatch(/(^|\s)sticky(\s|$)/);
      expect(c, `${text(th)} must be left-0`).toMatch(/(^|\s)left-0(\s|$)/);
      expect(c, `${text(th)} must have an opaque background`).toMatch(/(^|\s)bg-(background|card)(\s|$)/);
    }
  });

  it("has a visible scroll hint outside the table that is hidden from sm and up", () => {
    const { root, table, scroller } = setup();
    const hints = Array.from(root.querySelectorAll("*")).filter(
      (e) => /(^|\s)sm:hidden(\s|$)/.test(cls(e)) && !table.contains(e) && /scroll|swipe|sideways/i.test(text(e)),
    );
    expect(hints.length, "an element with sm:hidden and text about scrolling/swiping, outside the table").toBeGreaterThanOrEqual(1);
    // The hint is not itself inside a hidden-from-assistive-tech-only wrapper that is also the scroller.
    expect(hints.every((h) => h !== scroller)).toBe(true);
  });
});

describe("HL-014 fix1.3: short caption, explanation outside the scroller", () => {
  it("keeps a non-empty caption of at most 40 characters", () => {
    const { table } = setup();
    const cap = table.querySelector("caption");
    expect(cap).not.toBeNull();
    expect(text(cap!).length).toBeGreaterThan(0);
    expect(text(cap!).length).toBeLessThanOrEqual(40);
  });

  it("states that a dash means no data in a paragraph outside the scroller and the table", () => {
    const { root, table, scroller } = setup();
    const notes = Array.from(root.querySelectorAll("p")).filter(
      (p) => /dash/i.test(text(p)) && !scroller.contains(p) && !table.contains(p),
    );
    expect(notes.length).toBeGreaterThanOrEqual(1);
  });
});
