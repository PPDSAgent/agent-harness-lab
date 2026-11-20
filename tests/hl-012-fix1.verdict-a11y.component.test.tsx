// @vitest-environment jsdom
// FROZEN acceptance tests for HL-012 fix1 (reviewer's required fixes 1-3, reviews/2026-11-09T1542-HL-012-r1.md). Builder may not edit this file.
// All inline data is SYNTHETIC. Labels avoid the words null/undefined/NaN (HL-010b pitfall).
//   fix1: every data-table scroll wrapper (the table's parent) is focusable and named: tabindex="0", role="region", non-empty aria-label.
//   fix2: colour does not carry meaning alone: each harness name is text inside the trend chart's SVG, and each verdict
//         segment name (Pass, Conditional, Fail, No verdict) is text inside the breakdown chart's SVG (DESIGN.md: label directly when <= 4 series).
//   fix3: each figure's source footer (figcaption) states the data's date range (first and last UTC day).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import React from "react";
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
// All three harnesses have runs, and all four verdict outcomes occur. Dates: 2026-05-01 and 2026-05-02 only.
const RUNS: Run[] = [
  mk("claude-code", "2026-05-01T10:00:00Z", [v("PASS")]),
  mk("claude-code", "2026-05-02T10:00:00Z", [v("FAIL")]),
  mk("codex", "2026-05-01T10:00:00Z", [v("CONDITIONAL")]),
  mk("codex", "2026-05-02T10:00:00Z", [v("PASS")]),
  mk("team", "2026-05-01T10:00:00Z", [v("PASS")]),
  mk("team", "2026-05-02T10:00:00Z", []),
];

function figures(container: HTMLElement): HTMLElement[] {
  const f = Array.from(container.querySelectorAll("figure")) as HTMLElement[];
  expect(f.length, "two figures (trend, breakdown)").toBeGreaterThanOrEqual(2);
  return f;
}
function figureByTitle(container: HTMLElement, title: RegExp): HTMLElement {
  const f = figures(container).find((x) => title.test(x.querySelector("h3")?.textContent ?? ""));
  expect(f, `figure titled ${title}`).toBeTruthy();
  return f as HTMLElement;
}
function svgTexts(figure: HTMLElement): string[] {
  const svgs = Array.from(figure.querySelectorAll("[role=img] svg"));
  expect(svgs.length, "an svg chart inside the role=img").toBeGreaterThanOrEqual(1);
  return svgs.flatMap((s) => Array.from(s.querySelectorAll("text, tspan"))).map((t) => (t.textContent ?? "").trim()).filter(Boolean);
}
function openAll(container: HTMLElement) {
  for (const b of within(container).getAllByRole("button", { name: /show data table/i })) {
    if (b.getAttribute("aria-expanded") !== "true") fireEvent.click(b);
  }
}

describe("HL-012 fix1.1: data table scroll wrappers are focusable and named", () => {
  it("every table's parent has tabindex=0, role=region and a non-empty aria-label", () => {
    const { container } = render(<VerdictCharts runs={RUNS} />);
    openAll(container);
    const tables = Array.from(container.querySelectorAll("table"));
    expect(tables.length, "both data tables open").toBe(2);
    for (const t of tables) {
      const p = t.parentElement as HTMLElement;
      expect(p.getAttribute("tabindex"), "wrapper tabindex").toBe("0");
      expect(p.getAttribute("role"), "wrapper role").toBe("region");
      expect((p.getAttribute("aria-label") ?? "").trim().length, "wrapper aria-label").toBeGreaterThan(0);
    }
  });
});

describe("HL-012 fix1.2: colour does not carry meaning alone", () => {
  it("each harness name is text inside the trend chart's SVG", () => {
    const { container } = render(<VerdictCharts runs={RUNS} />);
    const texts = svgTexts(figureByTitle(container, /pass rate by day/i)).join(" | ");
    for (const h of ["claude-code", "codex", "team"]) {
      expect(texts, `trend svg text mentions ${h}`).toContain(h);
    }
  });
  it("each verdict segment name is text inside the breakdown chart's SVG", () => {
    const { container } = render(<VerdictCharts runs={RUNS} />);
    const texts = svgTexts(figureByTitle(container, /verdicts by harness/i)).join(" | ");
    for (const name of [/\bPass\b/, /\bConditional\b/, /\bFail\b/, /\bNo verdict\b/]) {
      expect(texts, `breakdown svg text mentions ${name}`).toMatch(name);
    }
  });
});

describe("HL-012 fix1.3: source footers state the date range", () => {
  it("each figcaption contains the first and last UTC day", () => {
    const { container } = render(<VerdictCharts runs={RUNS} />);
    const fs = figures(container);
    for (const f of fs) {
      const cap = f.querySelector("figcaption")?.textContent ?? "";
      expect(cap, "figcaption has first day").toContain("2026-05-01");
      expect(cap, "figcaption has last day").toContain("2026-05-02");
    }
  });
});
