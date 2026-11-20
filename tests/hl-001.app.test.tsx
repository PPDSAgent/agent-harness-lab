// @vitest-environment jsdom
// FROZEN acceptance tests for HL-001 (App skeleton) -- placeholder route + Recharts chart.
// Written by the test engineer before the build; the builder may not edit this file.
//
// Import contracts the builder must meet:
//   src/App.tsx            default export: React component, no required props, renders the
//                          placeholder page for the app's one route at the default URL ("/").
//                          If a router is used it must be self-contained inside App
//                          (the test renders <App /> bare, with no wrapper).
//   src/data/placeholder.ts  named export `placeholderSeries`: a non-empty array of plain
//                          objects, each with at least one finite numeric field, typed
//                          (e.g. `export const placeholderSeries: PlaceholderPoint[] = [...]`).
//                          The chart on the placeholder page is drawn from this array.
// Environment note: jsdom has no layout, so Recharts' ResponsiveContainer needs a size. This
// file stubs ResizeObserver (reporting 800x400) and element sizes; the builder need not do so,
// but the chart must be a real Recharts chart yielding `.recharts-surface` <svg>.
// jsdom, @testing-library/react, react, react-dom and recharts must be (dev)dependencies.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import React from "react";
import App from "../src/App";
import { placeholderSeries } from "../src/data/placeholder";

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
afterEach(() => cleanup());

describe("HL-001 Accept: chart data is a typed in-memory array", () => {
  it("src/data/placeholder.ts exports a non-empty array of records with numeric fields", () => {
    expect(Array.isArray(placeholderSeries)).toBe(true);
    expect(placeholderSeries.length).toBeGreaterThan(0);
    for (const row of placeholderSeries as unknown as Record<string, unknown>[]) {
      expect(typeof row).toBe("object");
      expect(Object.values(row).some((v) => typeof v === "number" && Number.isFinite(v))).toBe(true);
    }
  });
});

describe("HL-001 Accept: one route renders a placeholder page with one Recharts chart", () => {
  it("App renders a page (heading present)", () => {
    const { container } = render(<App />);
    expect(container.querySelector("h1, h2")).not.toBeNull();
  });

  it("a component test asserts the Recharts chart's SVG renders", () => {
    const { container } = render(<App />);
    const svg = container.querySelector(".recharts-wrapper svg.recharts-surface");
    expect(svg).not.toBeNull();
    expect(svg!.tagName.toLowerCase()).toBe("svg");
  });

  it("exactly one Recharts chart is drawn", () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll(".recharts-wrapper").length).toBe(1);
  });

  it("the chart draws marks from the data (at least one series path, bar or dot)", () => {
    const { container } = render(<App />);
    const marks = container.querySelectorAll(
      ".recharts-line-curve, .recharts-area-area, .recharts-bar-rectangle, .recharts-line-dot, .recharts-pie-sector, .recharts-scatter-symbol",
    );
    expect(marks.length).toBeGreaterThan(0);
  });
});
