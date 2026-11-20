// @vitest-environment jsdom
// FROZEN acceptance tests for HL-011b Accept 4 (per-skill section on the home page). Builder may not edit this file.
//
// CONTRACT (through App only; the builder chooses component names):
//   after the HL-011a control (button named /cost, tokens and latency/i) opens the usage view, the page has
//   - a heading (role=heading) whose name contains "skill" (case-insensitive), distinct from the HL-011a harness heading;
//   - inside that heading's section (nearest ancestor containing a table): at least one Recharts chart
//     (.recharts-wrapper) and at least two captioned tables (latency and tokens) with one body row per skill,
//     first cell = skill name, with p50/p95/p99/n column headers;
//   - rows for the four fixture skills; the strings null / undefined / NaN never appear in the section text.
// A null cell rendering as "—" is `manual:` here (no injection point in the App contract); see the UAT note in the freeze report.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 20000 }); // the section may lazy-load; a missing section must fail on the heading, not the timer
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  for (const [prop, val] of [["offsetWidth", 800], ["offsetHeight", 400], ["clientWidth", 800], ["clientHeight", 400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => val });
  }
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
});
afterEach(cleanup);

const SKILLS = ["code-review", "debugging", "plan-writing", "tdd"];
const FORBIDDEN = /\bnull\b|\bundefined\b/i;
const NAN = /\bNaN\b/;
const cells = (r: Element) => Array.from(r.querySelectorAll("th, td")).map((x) => (x.textContent ?? "").trim());

async function openSection(): Promise<HTMLElement> {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /cost, tokens and latency/i }));
  // The section may be lazy-loaded (HL-011b Accept 5 allows it), so wait for the heading.
  const heading = await screen.findByRole("heading", { name: /skill/i }, { timeout: 8000 });
  let node: HTMLElement | null = heading;
  while (node && !node.querySelector("table")) node = node.parentElement;
  expect(node, "an ancestor of the skill heading containing a table").not.toBeNull();
  return node as HTMLElement;
}
const skillTables = (section: HTMLElement) =>
  (Array.from(section.querySelectorAll("table")) as HTMLTableElement[]).filter((t) =>
    Array.from(t.querySelectorAll("tbody tr")).some((r) => SKILLS.includes(cells(r)[0] ?? "")));

describe("HL-011b Accept 4: per-skill section", () => {
  it("the default App render has no skill heading; the usage view adds one besides the harness heading", async () => {
    render(<App />);
    expect(screen.queryByRole("heading", { name: /skill/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /cost, tokens and latency/i }));
    expect(await screen.findByRole("heading", { name: "Cost, tokens and latency by harness" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: /skill/i }, { timeout: 8000 })).toBeTruthy();
  });
  it("the skill section has a chart", async () => {
    const section = await openSection();
    expect(section.querySelectorAll(".recharts-wrapper").length).toBeGreaterThanOrEqual(1);
  });
  it("has latency and tokens tables, captioned, one row per skill, skill name first, sorted", async () => {
    const section = await openSection();
    const tables = skillTables(section);
    expect(tables.length).toBeGreaterThanOrEqual(2);
    for (const re of [/latency/i, /token/i]) {
      const hits = tables.filter((t) => re.test(t.querySelector("caption")?.textContent ?? ""));
      expect(hits.length, `skill tables with caption ${re}`).toBeGreaterThanOrEqual(1);
      const names = Array.from(hits[0]!.querySelectorAll("tbody tr")).map((r) => cells(r)[0]);
      expect(names).toEqual(SKILLS);
      const heads = Array.from(hits[0]!.querySelectorAll("th")).map((h) => (h.textContent ?? "").toLowerCase());
      for (const k of ["p50", "p95", "p99", "n"]) expect(heads.some((h) => h.includes(k)), `header ${k}`).toBe(true);
    }
  });
  it("each skill row shows p50, p95, p99 and n cells with a value or —", async () => {
    const section = await openSection();
    for (const t of skillTables(section)) {
      for (const r of Array.from(t.querySelectorAll("tbody tr"))) {
        const c = cells(r).slice(1);
        expect(c.length, `cells after the name in ${cells(r)[0]}`).toBeGreaterThanOrEqual(4);
        for (const x of c.slice(0, 4)) expect(x === "—" || /^[\d.,]+\s*[a-zA-Z%$]*$/.test(x), `cell "${x}"`).toBe(true);
      }
    }
  });
  it("never prints null, undefined or NaN in the skill section", async () => {
    const section = await openSection();
    expect(section.textContent ?? "").not.toMatch(FORBIDDEN);
    expect(section.textContent ?? "").not.toMatch(NAN);
  });
});
