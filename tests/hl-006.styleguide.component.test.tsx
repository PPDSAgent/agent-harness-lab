// @vitest-environment jsdom
// FROZEN acceptance tests for HL-006 (design tokens + /styleguide route). Builder may not edit this file.
// Contract: rendering bare <App /> with window.location.pathname === "/styleguide" shows the style guide;
// "/" still shows the existing main route. Sections are found by heading text (level 2 or 3), swatches by
// token name text. Routing mechanism (own router, history, conditional) is the builder's choice.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import App from "../src/App";

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
});
beforeEach(() => window.history.pushState({}, "", "/styleguide"));
afterEach(() => { cleanup(); window.history.pushState({}, "", "/"); });

function section(name: RegExp): HTMLElement {
  const h = screen.getAllByRole("heading").find((el) => name.test(el.textContent ?? ""));
  if (!h) throw new Error(`no heading matching ${name}`);
  const region = h.closest("section") ?? h.parentElement!;
  return region as HTMLElement;
}

describe("HL-006 /styleguide route", () => {
  it("renders a level-1 heading naming the style guide", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: /style ?guide/i })).toBeTruthy();
  });

  it("shows a type scale section with at least 5 sizes and a sample of each", () => {
    render(<App />);
    const s = section(/type( scale)?/i);
    const rows = within(s).getAllByText(/\b\d+(\.\d+)?\s?(px|rem)\b/i);
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it("shows the D1 system font stacks (no bundled webfont names)", () => {
    render(<App />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/system-ui|-apple-system/);
    expect(text).toMatch(/ui-monospace/);
    expect(text).not.toMatch(/IBM Plex|Inter\b/);
  });

  it("shows colour token swatches including the semantic tokens", () => {
    render(<App />);
    const s = section(/colou?r/i);
    for (const token of ["background", "foreground", "primary", "evidence", "muted-foreground", "destructive", "border", "card"]) {
      expect(within(s).getAllByText(new RegExp(`(^|[^-\\w])${token}($|[^-\\w])`)).length, token).toBeGreaterThan(0);
    }
  });

  it("shows the 6-colour chart palette chart-1 to chart-6, each a swatch", () => {
    render(<App />);
    const s = section(/chart/i);
    for (let i = 1; i <= 6; i++) {
      expect(within(s).getAllByText(new RegExp(`chart-${i}\\b`)).length, `chart-${i}`).toBeGreaterThan(0);
    }
    expect(within(s).queryAllByText(/chart-7\b/)).toHaveLength(0);
  });

  it("shows a motion section with at least one sample", () => {
    render(<App />);
    const s = section(/motion/i);
    expect(s.textContent ?? "").toMatch(/reduce/i);
    expect(within(s).getAllByText(/\b\d+\s?ms\b/i).length).toBeGreaterThan(0);
  });

  it("offers the Dark / Light / System theme toggle (D3)", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: /style ?guide/i })).toBeTruthy();
    for (const n of ["Dark", "Light", "System"]) expect(screen.getByRole("button", { name: n })).toBeTruthy();
  });
});

describe("HL-006 regression: main route", () => {
  it("at / the placeholder chart page still renders and the style guide does not", () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: /request latency/i })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: /style ?guide/i })).toBeNull();
  });
});
