// @vitest-environment jsdom
// FROZEN acceptance tests for HL-012 Accept 2 (Eval pass rate section). Builder may not edit this file.
// All inline data is SYNTHETIC. Fixture ids/labels avoid the words null/undefined/NaN on purpose (HL-010b pitfall).
//
// CONTRACT: src/components/verdict-charts.tsx, default export ({ runs }: { runs: Run[] }) => JSX.
//   Contains a heading "Eval pass rate"; >= 2 role="img" charts with non-empty aria-label, >= 1 Recharts chart;
//   "Show data table" toggle button(s) with aria-expanded revealing captioned table(s);
//   a null pass rate renders as "—" (never null/undefined/NaN/0%); excluded undated runs are announced with their count.
//   App also renders an "Eval pass rate" heading (possibly after lazy load).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import App from "../src/App";
import VerdictCharts from "../src/components/verdict-charts";
import type { Harness, Run, Verdict } from "../src/lib/ingest";

vi.setConfig({ testTimeout: 20000 });

beforeAll(() => {
  class FakeResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe(target: Element) {
      const rect = { width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, x: 0, y: 0 } as DOMRectReadOnly;
      this.cb([{ target, contentRect: rect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = FakeResizeObserver;
  for (const [prop, val] of [["offsetWidth", 800], ["offsetHeight", 400], ["clientWidth", 800], ["clientHeight", 400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => val });
  }
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
});
afterEach(cleanup);

const v = (value: Verdict["value"], stepIndex = 0): Verdict => ({ value, stepIndex });
function mk(harness: Harness, startedAt: string | null, verdicts: Verdict[]): Run {
  return {
    harness, id: "run-x", startedAt, endedAt: null, durationMs: null,
    steps: [], toolCalls: [], usage: null, verdicts, claims: [], recordCount: 0, droppedCount: 0,
  };
}
const cells = (r: Element) => Array.from(r.querySelectorAll("th, td")).map((x) => (x.textContent ?? "").trim());
const RUNS: Run[] = [
  mk("claude-code", "2026-05-01T10:00:00Z", [v("PASS")]),
  mk("claude-code", "2026-05-02T10:00:00Z", [v("FAIL")]),
  mk("codex", "2026-05-01T10:00:00Z", [v("CONDITIONAL")]),
  mk("team", "2026-05-02T10:00:00Z", []), // team has no verdicts at all: pass rate is unknown
];

function sectionOf(): HTMLElement {
  const heading = screen.getByRole("heading", { name: "Eval pass rate" });
  let node: HTMLElement | null = heading;
  while (node && !node.querySelector("[role=img]")) node = node.parentElement;
  expect(node, "an ancestor of the heading containing a chart").not.toBeNull();
  return node as HTMLElement;
}
function openTables(section: HTMLElement) {
  for (const b of within(section).getAllByRole("button", { name: /show data table/i })) {
    if (b.getAttribute("aria-expanded") !== "true") fireEvent.click(b);
  }
}

describe("HL-012 Accept 2: VerdictCharts", () => {
  it("has the heading, at least two labelled role=img charts and a Recharts chart", () => {
    render(<VerdictCharts runs={RUNS} />);
    const section = sectionOf();
    const imgs = Array.from(section.querySelectorAll("[role=img]"));
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    for (const i of imgs) expect((i.getAttribute("aria-label") ?? "").trim().length).toBeGreaterThan(10);
    expect(section.querySelectorAll(".recharts-wrapper").length).toBeGreaterThanOrEqual(1);
  });
  it("the trend y-axis spans 0 to 100 percent", () => {
    render(<VerdictCharts runs={RUNS} />);
    const text = sectionOf().textContent ?? "";
    expect(text).toContain("100%");
  });
  it("Show data table toggles aria-expanded and reveals captioned tables", () => {
    render(<VerdictCharts runs={RUNS} />);
    const section = sectionOf();
    const toggles = within(section).getAllByRole("button", { name: /show data table/i });
    expect(toggles.length).toBeGreaterThanOrEqual(1);
    for (const t of toggles) expect(t.getAttribute("aria-expanded")).toBe("false");
    expect(section.querySelectorAll("table caption").length).toBe(0);
    fireEvent.click(toggles[0]!);
    expect(toggles[0]!.getAttribute("aria-expanded")).toBe("true");
    const tables = Array.from(section.querySelectorAll("table"));
    expect(tables.length).toBeGreaterThanOrEqual(1);
    for (const t of tables) expect((t.querySelector("caption")?.textContent ?? "").trim().length).toBeGreaterThan(0);
  });
  it("the tables list the harnesses, and an unknown pass rate shows — never null/undefined/NaN/0%", () => {
    render(<VerdictCharts runs={RUNS} />);
    const section = sectionOf();
    openTables(section);
    const rows = Array.from(section.querySelectorAll("table tbody tr"));
    const teamRows = rows.filter((r) => cells(r).some((c) => c === "team"));
    expect(teamRows.length).toBeGreaterThanOrEqual(1);
    for (const r of teamRows) {
      const c = cells(r);
      expect(c.some((x) => x === "—"), `team row ${JSON.stringify(c)} shows —`).toBe(true);
      for (const x of c) expect(x).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b|^0\s*%$/i);
    }
    for (const h of ["claude-code", "codex"]) expect(rows.some((r) => cells(r).includes(h)), `row for ${h}`).toBe(true);
    // a real 0 stays 0: the claude-code day with only a FAIL is a judged 0%
    expect(rows.some((r) => cells(r).includes("claude-code") && cells(r).some((x) => /^0(\.0)?\s*%$/.test(x)))).toBe(true);
    expect(section.textContent ?? "").not.toMatch(/\bundefined\b|\bNaN\b/);
  });
  it("says how many undated runs were excluded, and says nothing when there are none", () => {
    const withBad = [...RUNS, mk("codex", null, [v("PASS")]), mk("codex", "not-a-date", [v("PASS")])];
    const { unmount } = render(<VerdictCharts runs={withBad} />);
    const t = sectionOf().textContent ?? "";
    expect(t).toMatch(/\b2\b[^.]{0,80}(excluded|date)|(excluded|date)[^.]{0,80}\b2\b/i);
    unmount();
    render(<VerdictCharts runs={RUNS} />);
    expect(sectionOf().textContent ?? "").not.toMatch(/excluded|missing date|no date/i);
  });
});

describe("HL-012 Accept 2: App", () => {
  it("renders an Eval pass rate heading on the home page", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Eval pass rate" }, { timeout: 8000 })).toBeTruthy();
  });
});
