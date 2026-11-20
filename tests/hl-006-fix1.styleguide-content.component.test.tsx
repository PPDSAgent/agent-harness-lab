// @vitest-environment jsdom
// FROZEN fix1 tests for HL-006 (reviewer r1 required fixes 2 and 3, content part). Builder may not edit.
// Token list is read from the @theme block of src/index.css so it cannot drift.
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  return (h.closest("section") ?? h.parentElement!) as HTMLElement;
}

function themeColorTokens(): string[] {
  const css = readFileSync("src/index.css", "utf8");
  const m = /@theme(\s+inline)?\s*\{/.exec(css);
  if (!m) throw new Error("no @theme block in src/index.css");
  const open = m.index + m[0].length - 1;
  let depth = 0, end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) { end = i; break; }
  }
  const block = css.slice(open, end);
  return [...block.matchAll(/--color-([\w-]+)\s*:/g)].map((m) => m[1]);
}

/** The element that names a token (exact text, optional -- / --color- prefix). */
function nameEl(root: HTMLElement, token: string): HTMLElement | undefined {
  const re = new RegExp(`^(--(color-)?)?${token}$`);
  return [...root.querySelectorAll<HTMLElement>("*")].find((e) => e.children.length === 0 && re.test((e.textContent ?? "").trim()));
}
function itemOf(el: HTMLElement): HTMLElement {
  return (el.closest("li, tr, figure, [role=listitem]") ?? el.parentElement!) as HTMLElement;
}

describe("HL-006 fix1 required fix 2: every @theme --color-* token has a swatch", () => {
  it("reads a plausible token list from index.css (guards the reader)", () => {
    const t = themeColorTokens();
    expect(t.length).toBeGreaterThanOrEqual(25);
    for (const n of ["surface-2", "surface-3", "elevation-highlight", "live", "live-foreground"]) expect(t, n).toContain(n);
  });

  it("colour section names every --color-* token of the @theme block (D2(c) elevation tints and inner card edge included)", () => {
    render(<App />);
    const s = section(/colou?r/i);
    const missing = themeColorTokens().filter((t) => !nameEl(s, t));
    expect(missing).toEqual([]);
  });
});

describe("HL-006 fix1 required fix 3: chart palette never relies on colour alone", () => {
  it("each of chart-1..chart-6 has a marker shape (svg or glyph) and a direct text label", () => {
    render(<App />);
    const s = section(/chart/i);
    const shapes = new Set<string>();
    for (let i = 1; i <= 6; i++) {
      const el = nameEl(s, `chart-${i}`);
      expect(el, `chart-${i} named`).toBeTruthy();
      const item = itemOf(el!);
      const svg = item.querySelector("svg");
      const rest = (item.textContent ?? "").replace(new RegExp(`(--(color-)?)?chart-${i}\\b`), "").replace(/#[0-9a-f]{3,8}|[\d.:]+/gi, "");
      const glyph = rest.match(/[■-◿★☆✚✦⬟-⬯●]/u)?.[0];
      expect(Boolean(svg) || Boolean(glyph), `chart-${i} marker shape`).toBe(true);
      expect(/[A-Za-z]{3,}/.test(rest.replace(/[■-◿]/gu, "")), `chart-${i} direct label`).toBe(true);
      shapes.add(svg ? [...svg.querySelectorAll("*")].map((n) => n.tagName + (n.getAttribute("d") ?? n.getAttribute("points") ?? "")).join("|") : glyph!);
    }
    expect(shapes.size, "six distinct marker shapes").toBe(6);
  });

  it("latency line-style sample labels p50, p95 and p99, each beside a line sample", () => {
    render(<App />);
    const s = section(/chart/i);
    for (const p of ["p50", "p95", "p99"]) {
      const el = [...s.querySelectorAll<HTMLElement>("*")].find((e) => e.children.length === 0 && new RegExp(`\\b${p}\\b`).test(e.textContent ?? ""));
      expect(el, `${p} label`).toBeTruthy();
      const item = itemOf(el!);
      expect(item.querySelector("svg line, svg path, svg polyline"), `${p} line sample`).toBeTruthy();
    }
  });
});

describe("HL-006 fix1 required fix 3: type scale shows weights, line-height and a mono sample", () => {
  it("states heading weights", () => {
    render(<App />);
    const t = section(/type/i).textContent ?? "";
    expect(t).toMatch(/weight|semibold|medium|bold/i);
    expect(t).toMatch(/\b[4-7]00\b/);
  });
  it("states line-height values", () => {
    render(<App />);
    const t = section(/type/i).textContent ?? "";
    expect(t).toMatch(/(line[- ]?height|leading)[^\d]{0,20}\d|\d+(px)?\s*\/\s*\d+(\.\d+)?(px)?/i);
  });
});
