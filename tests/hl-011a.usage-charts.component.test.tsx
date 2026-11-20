// @vitest-environment jsdom
// FROZEN acceptance tests for HL-011a (UsageCharts component and the home page wiring).
// Builder may not edit this file. All inline data is SYNTHETIC.
//
// CONTRACT: src/components/usage-charts.tsx
//   export function UsageCharts(props: { rows: HarnessSummary[] }): JSX.Element   (named export;
//   rows come from summarizeByHarness in src/lib/usage-summary.ts)
//   - a heading (role=heading) "Cost, tokens and latency by harness"
//   - per metric with at least one value in some row: one Recharts chart (.recharts-wrapper) whose
//     text carries the labels "p50", "p95", "p99" and an axis title with its unit (ms / tokens / USD),
//     a <table> with a non-empty <caption> and one body row per harness row (first cell = harness name,
//     p50/p95/p99/n cells), a null shown as the em dash "—", and one source footer whose text matches
//     /source/i and names its run counts as "<n> runs"
//   - per metric with no values in any row: text "No data" instead of a chart
//   - the strings null / undefined / NaN never appear in the section text
// App wiring (revised): the default render is unchanged; a button named /cost, tokens and latency/i
// opens the view. The builder chooses whether the HL-001 chart and runs list stay visible afterwards.
// NOTE for the builder: do not put the word "runs" in any new table caption or accessible name; the
// HL-010a runs-list tests and e2e find the runs table with getByRole("table", {name: /runs/i}).
// Fixture labels below never contain "null", "undefined" or "NaN" (as substrings, any case).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readdirSync } from "node:fs";
import React from "react";
import App from "../src/App";
import { UsageCharts } from "../src/components/usage-charts";

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

const metric = (p50: number | null, p95: number | null, p99: number | null, n: number, missing: number) => ({ p50, p95, p99, n, missing });
// Rows are literal (not built by summarizeByHarness) so these tests isolate the component.
const full: any[] = [
  { harness: "claude-code", runs: 5, latencyMs: metric(300, 500, 500, 5, 0), tokens: metric(2000, 3000, 3000, 3, 2), costUsd: metric(null, null, null, 0, 5) },
  { harness: "codex", runs: 4, latencyMs: metric(20, 40, 40, 4, 0), tokens: metric(15, 35, 35, 4, 0), costUsd: metric(null, null, null, 0, 4) },
  { harness: "team", runs: 3, latencyMs: metric(60000, 120000, 120000, 2, 1), tokens: metric(7000, 7000, 7000, 1, 2), costUsd: metric(0.25, 0.5, 0.5, 2, 1) },
];
const noCost: any[] = full.slice(0, 2);
// A partly-null row: the p95/p99 cells of team latency are null (e.g. a single value elsewhere).
const partial: any[] = [
  { harness: "claude-code", runs: 2, latencyMs: metric(300, null, null, 2, 0), tokens: metric(10, 20, 20, 2, 0), costUsd: metric(0.5, 0.75, 0.75, 2, 0) },
  { harness: "team", runs: 2, latencyMs: metric(null, null, null, 0, 2), tokens: metric(10, 20, 20, 2, 0), costUsd: metric(0.5, 0.75, 0.75, 2, 0) },
];

const FORBIDDEN = /\bnull\b|\bundefined\b/i;
const NAN = /\bNaN\b/;
const tableByCaption = (c: HTMLElement, re: RegExp) => {
  const hits = Array.from(c.querySelectorAll("table")).filter((t) => re.test(t.querySelector("caption")?.textContent ?? ""));
  expect(hits.length, `tables whose caption matches ${re}`).toBe(1);
  return hits[0] as HTMLTableElement;
};
const bodyRows = (t: HTMLElement) => Array.from(t.querySelectorAll("tbody tr")) as HTMLElement[];
const cells = (r: HTMLElement) => Array.from(r.querySelectorAll("th, td")).map((x) => (x.textContent ?? "").trim());

describe("HL-011a Accept 2: section, one chart per metric, labeled series, units, source footer", () => {
  it("renders the section heading", () => {
    render(<UsageCharts rows={full} />);
    expect(screen.getByRole("heading", { name: "Cost, tokens and latency by harness" })).toBeTruthy();
  });
  it("draws one Recharts chart per metric (latency, tokens, cost)", () => {
    const { container } = render(<UsageCharts rows={full} />);
    expect(container.querySelectorAll(".recharts-wrapper").length).toBe(3);
    expect(container.querySelectorAll(".recharts-wrapper svg.recharts-surface").length).toBe(3);
  });
  it("every chart carries the p50, p95 and p99 labels as text", () => {
    const { container } = render(<UsageCharts rows={full} />);
    for (const w of Array.from(container.querySelectorAll(".recharts-wrapper"))) {
      const t = w.textContent ?? "";
      expect(t).toContain("p50");
      expect(t).toContain("p95");
      expect(t).toContain("p99");
    }
  });
  it("each chart has an axis title with its unit: ms, tokens, USD", () => {
    const { container } = render(<UsageCharts rows={full} />);
    const texts = Array.from(container.querySelectorAll(".recharts-wrapper")).map((w) => w.textContent ?? "");
    expect(texts.filter((t) => /\bms\b/.test(t)).length).toBe(1);
    expect(texts.filter((t) => /\btokens\b/i.test(t)).length).toBe(1);
    expect(texts.filter((t) => /\bUSD\b/.test(t)).length).toBe(1);
  });
  it("has one source footer per chart naming run counts", () => {
    const { container } = render(<UsageCharts rows={full} />);
    const sources = screen.getAllByText(/source/i).filter((e) => container.contains(e));
    expect(sources.length).toBeGreaterThanOrEqual(3);
    for (const s of sources) expect(s.textContent ?? "").toMatch(/\d+\s+runs?/i);
  });
});

describe("HL-011a Accept 3: accessible data tables", () => {
  it("each metric has a captioned table with one row per harness, harness name first", () => {
    const { container } = render(<UsageCharts rows={full} />);
    for (const re of [/latency/i, /token/i, /cost/i]) {
      const t = tableByCaption(container, re);
      expect((t.querySelector("caption")!.textContent ?? "").trim().length).toBeGreaterThan(0);
      const rows = bodyRows(t);
      expect(rows.map((r) => cells(r)[0])).toEqual(["claude-code", "codex", "team"]);
    }
  });
  it("tables list p50, p95, p99 and n as column headers", () => {
    const { container } = render(<UsageCharts rows={full} />);
    const heads = Array.from(tableByCaption(container, /latency/i).querySelectorAll("th")).map((h) => (h.textContent ?? "").toLowerCase());
    for (const k of ["p50", "p95", "p99", "n"]) expect(heads.some((h) => h.includes(k)), `header ${k}`).toBe(true);
  });
  it("shows a value and the run count n in the row", () => {
    const { container } = render(<UsageCharts rows={full} />);
    const codex = bodyRows(tableByCaption(container, /latency/i)).find((r) => cells(r)[0] === "codex")!;
    expect(cells(codex).some((c) => /\b4\b/.test(c))).toBe(true);
    expect(cells(codex).some((c) => /\b20\b/.test(c))).toBe(true);
  });
  it("renders a null value as — and never null, undefined or NaN anywhere in the section", () => {
    const { container } = render(<UsageCharts rows={partial} />);
    const lat = bodyRows(tableByCaption(container, /latency/i));
    const cc = cells(lat.find((r) => cells(r)[0] === "claude-code")!);
    expect(cc.filter((c) => c === "—").length).toBe(2); // p95 and p99 are null
    const tm = cells(lat.find((r) => cells(r)[0] === "team")!);
    expect(tm.filter((c) => c === "—").length).toBe(3); // p50, p95, p99 all null
    const text = container.textContent ?? "";
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(NAN);
  });
  it("full data also never prints null, undefined or NaN", () => {
    const { container } = render(<UsageCharts rows={full} />);
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
    expect(container.textContent ?? "").not.toMatch(NAN);
  });
});

describe("HL-011a Accept 4: empty state for a metric with no values", () => {
  it("cost with only claude-code and codex rows shows No data and no cost chart", () => {
    const { container } = render(<UsageCharts rows={noCost} />);
    expect(within(container).getAllByText(/No data/).length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll(".recharts-wrapper").length).toBe(2);
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
    expect(container.textContent ?? "").not.toMatch(NAN);
  });
  it("with no rows at all every metric shows No data and no chart is drawn", () => {
    const { container } = render(<UsageCharts rows={[]} />);
    expect(screen.getByRole("heading", { name: "Cost, tokens and latency by harness" })).toBeTruthy();
    expect(within(container).getAllByText(/No data/).length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll(".recharts-wrapper").length).toBe(0);
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });
});

describe("HL-011a Accept 5 (revised): App default render unchanged; a control opens the usage view", () => {
  const HEADING = "Cost, tokens and latency by harness";
  const openView = () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /cost, tokens and latency/i }));
  };
  it("the default App render has no usage section heading", () => {
    render(<App />);
    expect(screen.queryByRole("heading", { name: HEADING })).toBeNull();
    expect(screen.getByRole("button", { name: /cost, tokens and latency/i })).toBeTruthy();
  });
  it("activating the control shows the section heading", async () => {
    openView();
    expect(await screen.findByRole("heading", { name: HEADING })).toBeTruthy();
  });
  it("the view has a team row and counts every committed runs/*.json record", async () => {
    const n = readdirSync(`${__dirname}/../runs`).filter((f) => f.endsWith(".json")).length;
    expect(n).toBeGreaterThan(0);
    openView();
    // Section = the nearest ancestor of the heading that contains a table.
    let node: HTMLElement | null = await screen.findByRole("heading", { name: HEADING });
    while (node && !node.querySelector("table")) node = node.parentElement;
    expect(node, "an ancestor of the heading containing a table").not.toBeNull();
    const section = node as HTMLElement;
    const teamRows = Array.from(section.querySelectorAll("tbody tr")).filter((r) => cells(r as HTMLElement)[0] === "team");
    expect(teamRows.length).toBeGreaterThan(0);
    // Some single element's own text carries the team's record count (cells/footers are separate elements).
    const own = (e: Element) => Array.from(e.childNodes).filter((c) => c.nodeType === 3).map((c) => c.textContent).join(" ");
    const re = new RegExp(`\\b${n}\\b`);
    expect(Array.from(section.querySelectorAll("*")).some((e) => re.test(own(e))), `an element showing ${n}`).toBe(true);
    expect(section.textContent ?? "").not.toMatch(FORBIDDEN);
    expect(section.textContent ?? "").not.toMatch(NAN);
  });
});
