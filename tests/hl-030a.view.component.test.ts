// @vitest-environment jsdom
// FROZEN acceptance tests for HL-030a A4 (the pure renderer `renderSeriesChart`). Builder may not edit this file.
// All data is SYNTHETIC (dates 2026-01-01.., y from a fixed formula, generated here). Runs in jsdom (per-file comment above).
//
// CONTRACT (from the task block): src/mcp/series-chart/view.ts exports renderSeriesChart(container: HTMLElement, data: unknown).
//   Valid data draws one <svg role="img"> whose accessible name includes the title, one line <path>, one marker per point.
//   null / empty series / malformed data render a visible text message and no <svg>.
// ASSUMPTION: "valid structured content" is the A3 structuredContent shape { title?: string, series: Array<{ t, y }> }
//   (the same assumption as hl-030a.server.test.ts). Markers are <circle> elements (or any element with a data-marker
//   attribute); the axes must not use <path> (exactly one <path> in the svg: the data line).
// ASSUMPTION: accessible name = aria-label, or the text of the element(s) named by aria-labelledby, or a <title> child.
import { afterEach, describe, expect, it } from "vitest";
import { renderSeriesChart } from "../src/mcp/series-chart/view";

type Pt = { t: string; y: number };
function makeSeries(n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => ({
    t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    y: ((i * 5) % 17) + i,
  }));
}

let box: HTMLElement | undefined;
function fresh(): HTMLElement {
  box?.remove();
  box = document.createElement("div");
  document.body.appendChild(box);
  return box;
}
afterEach(() => {
  box?.remove();
  box = undefined;
});

function accessibleName(svg: Element): string {
  const label = svg.getAttribute("aria-label");
  if (label) return label;
  const by = svg.getAttribute("aria-labelledby");
  if (by) {
    return by
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
  }
  return svg.querySelector("title")?.textContent ?? "";
}

describe("HL-030a A4 · renderSeriesChart draws valid data", () => {
  it("draws exactly one <svg role=img> with an accessible name containing the title", () => {
    const c = fresh();
    renderSeriesChart(c, { title: "Synthetic widgets per day", series: makeSeries(9) });
    const svgs = c.querySelectorAll("svg");
    expect(svgs).toHaveLength(1);
    expect(svgs[0]!.getAttribute("role")).toBe("img");
    expect(accessibleName(svgs[0]!)).toContain("Synthetic widgets per day");
  });

  it("draws one line <path> and one marker per point", () => {
    for (const n of [2, 9, 40]) {
      const c = fresh();
      renderSeriesChart(c, { title: "t", series: makeSeries(n) });
      const svg = c.querySelector("svg")!;
      expect(svg.querySelectorAll("path"), `n=${n} paths`).toHaveLength(1);
      expect(svg.querySelectorAll("circle, [data-marker]"), `n=${n} markers`).toHaveLength(n);
    }
  });

  it("the line path has real geometry (a d attribute with a move and at least n-1 further segments)", () => {
    const c = fresh();
    renderSeriesChart(c, { title: "t", series: makeSeries(6) });
    const d = c.querySelector("svg path")!.getAttribute("d") ?? "";
    expect(d.trim().startsWith("M")).toBe(true);
    expect(d).not.toMatch(/NaN|undefined|Infinity/);
    expect((d.match(/[LlCcSsQqHhVv]/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("title is optional: still one svg with role=img and a non-empty accessible name", () => {
    const c = fresh();
    renderSeriesChart(c, { series: makeSeries(4) });
    const svg = c.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(accessibleName(svg).trim().length).toBeGreaterThan(0);
  });

  it("a flat series (all y equal) still draws finite geometry", () => {
    const c = fresh();
    renderSeriesChart(c, {
      title: "flat",
      series: [
        { t: "2026-01-01", y: 3 },
        { t: "2026-01-02", y: 3 },
        { t: "2026-01-03", y: 3 },
      ],
    });
    const svg = c.querySelector("svg")!;
    expect(svg).not.toBeNull();
    expect(svg.outerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("rendering again into the same container replaces the chart (still exactly one svg)", () => {
    const c = fresh();
    renderSeriesChart(c, { title: "first", series: makeSeries(5) });
    renderSeriesChart(c, { title: "second", series: makeSeries(7) });
    expect(c.querySelectorAll("svg")).toHaveLength(1);
    expect(c.querySelectorAll("svg circle, svg [data-marker]")).toHaveLength(7);
    expect(accessibleName(c.querySelector("svg")!)).toContain("second");
  });

  it("a title with markup is shown as text, never interpreted", () => {
    const c = fresh();
    renderSeriesChart(c, { title: '<img src=x onerror="window.__hl030a=1"><b>bold</b>', series: makeSeries(3) });
    expect(c.querySelector("img")).toBeNull();
    expect(c.querySelector("b")).toBeNull();
    expect((window as unknown as { __hl030a?: number }).__hl030a).toBeUndefined();
    expect(c.querySelector("svg")).not.toBeNull();
  });
});

describe("HL-030a A4 · renderSeriesChart with no usable data renders a text message and no svg", () => {
  const cases: Array<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["a string", "not data"],
    ["an empty object", {}],
    ["an empty series", { title: "x", series: [] }],
    ["series that is not an array", { series: "nope" }],
    ["a point with an unparseable date", { series: [{ t: "garbage", y: 1 }, { t: "2026-01-02", y: 2 }] }],
    ["a point with a non-finite y", { series: [{ t: "2026-01-01", y: Number.NaN }, { t: "2026-01-02", y: 2 }] }],
    ["a point that is not an object", { series: [1, 2, 3] }],
  ];
  for (const [label, data] of cases) {
    it(`${label}: visible text message, no <svg>, no leaked NaN/null/undefined`, () => {
      const c = fresh();
      renderSeriesChart(c, data);
      expect(c.querySelector("svg")).toBeNull();
      const text = (c.textContent ?? "").trim();
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/\b(NaN|undefined|null)\b/);
    });
  }

  it("an invalid render after a valid one removes the old chart", () => {
    const c = fresh();
    renderSeriesChart(c, { title: "ok", series: makeSeries(5) });
    expect(c.querySelector("svg")).not.toBeNull();
    renderSeriesChart(c, null);
    expect(c.querySelector("svg")).toBeNull();
    expect((c.textContent ?? "").trim().length).toBeGreaterThan(0);
  });
});
