// @vitest-environment jsdom
// FROZEN acceptance tests for HL-014 A2, A3 (source check) and A4 (structure only). Builder may not edit this file.
// All inline data is SYNTHETIC. Fixture ids avoid the words null/undefined/NaN on purpose (HL-010b pitfall).
//
// CONTRACT: src/components/harness-comparison.tsx, default export ({ runs }: { runs: Run[] }) => JSX.
//   Root: role "region" with accessible name matching /compare harnesses/i (e.g. <section aria-label="Compare harnesses">).
//   One <table> with a <caption>; first header cell is for the metric label, then one column header per harness whose text is
//   the harness id as the usage charts show it: claude-code, codex, team. Seven body rows (one per metric, row header first):
//   runs, tool-call error rate, median duration, p95 duration, median tokens, verdict pass rate, unsupported-claim share.
//   Row labels contain /error/i, /pass/i and /unsupported/i for the three rate rows. Rates render as percent ("40%" or "40.0%").
//   A null metric renders "—". Rendered text never contains null, undefined or NaN.
//   A4 (structure): the table has an ancestor inside the region with class overflow-x-auto or overflow-x-scroll.
//   App: <h2> containing a <button aria-expanded> named "Compare harnesses"; the section is React.lazy-loaded.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import App from "../src/App";
import HarnessComparison from "../src/components/harness-comparison";
import type { Claim, Harness, Run, ToolCall, Verdict } from "../src/lib/ingest";

vi.setConfig({ testTimeout: 20000 });
afterEach(cleanup);

const tc = (isError: boolean | null): ToolCall => ({ id: null, name: null, startedAt: null, endedAt: null, durationMs: null, isError, skill: null });
const vd = (value: Verdict["value"]): Verdict => ({ value, stepIndex: 0 });
const cl = (hasEvidence: boolean): Claim => ({ text: "synthetic claim", hasEvidence, stepIndex: 0 });
function mk(harness: Harness, id: string, o: { dur?: number | null; tokens?: number | null; calls?: (boolean | null)[]; verdicts?: Verdict["value"][]; claims?: boolean[] }): Run {
  return {
    harness, id, startedAt: null, endedAt: null, durationMs: o.dur ?? null,
    steps: [], toolCalls: (o.calls ?? []).map(tc),
    usage: o.tokens === undefined || o.tokens === null ? null : { inputTokens: null, outputTokens: null, totalTokens: o.tokens },
    verdicts: (o.verdicts ?? []).map(vd), claims: (o.claims ?? []).map(cl), recordCount: 0, droppedCount: 0,
  };
}
// claude-code: error rate 2 of 5 = 40%, pass rate 3 of 5 = 60%, unsupported 2 of 4 = 50%. codex and team: no data.
const RUNS: Run[] = [
  mk("claude-code", "run-a", { dur: 2000, tokens: 100, calls: [true, false], verdicts: ["PASS", "PASS"], claims: [true, false] }),
  mk("claude-code", "run-b", { dur: 4000, tokens: 300, calls: [false, null], verdicts: ["FAIL"], claims: [false] }),
  mk("claude-code", "run-c", { dur: null, tokens: null, calls: [true], verdicts: ["CONDITIONAL"] }),
  mk("claude-code", "run-d", { dur: 6000, tokens: 500, calls: [false], verdicts: ["PASS"], claims: [true] }),
  mk("codex", "run-e", {}),
];

const text = (e: Element) => (e.textContent ?? "").trim();
function section(): HTMLElement {
  return screen.getByRole("region", { name: /compare harnesses/i });
}
function table(root: HTMLElement): HTMLTableElement {
  const t = root.querySelector("table");
  if (!t) throw new Error("no table in section");
  return t;
}
const bodyRows = (t: Element) => Array.from(t.querySelectorAll("tbody tr"));
const rowFor = (t: Element, label: RegExp) => {
  const r = bodyRows(t).find((x) => label.test(text(x.querySelector("th, td")!)));
  if (!r) throw new Error(`no row matching ${label}`);
  return Array.from(r.querySelectorAll("td")).map(text);
};

describe("HL-014 A2: comparison table", () => {
  it("is a named region with one captioned table: metric column then claude-code, codex, team", () => {
    render(<HarnessComparison runs={RUNS} />);
    const t = table(section());
    expect(t.querySelectorAll("caption")).toHaveLength(1);
    expect(text(t.querySelector("caption")!).length).toBeGreaterThan(0);
    const heads = Array.from(t.querySelectorAll("thead th")).map(text);
    expect(heads).toHaveLength(4);
    expect(heads.slice(1)).toEqual(["claude-code", "codex", "team"]);
  });

  it("has one body row per metric (seven), each with a row header and three value cells", () => {
    render(<HarnessComparison runs={RUNS} />);
    const rows = bodyRows(table(section()));
    expect(rows).toHaveLength(7);
    for (const r of rows) {
      expect(r.querySelectorAll("th")).toHaveLength(1);
      expect(r.querySelectorAll("td")).toHaveLength(3);
    }
  });

  it("renders rates as percentages", () => {
    render(<HarnessComparison runs={RUNS} />);
    const t = table(section());
    expect(rowFor(t, /error/i)[0]).toMatch(/^40(\.0)?%$/);
    expect(rowFor(t, /pass/i)[0]).toMatch(/^60(\.0)?%$/);
    expect(rowFor(t, /unsupported/i)[0]).toMatch(/^50(\.0)?%$/);
  });

  it("renders a null metric as an em dash in every cell of an empty harness column", () => {
    render(<HarnessComparison runs={RUNS} />);
    const t = table(section());
    const all = bodyRows(t).map((r) => Array.from(r.querySelectorAll("td")).map(text));
    // Row 0 is the run count; every other row for codex (index 1) and team (index 2) has no data.
    const metricRows = all.filter((cells) => cells[1] === "—");
    expect(metricRows).toHaveLength(6);
    for (const cells of metricRows) expect(cells[2]).toBe("—");
    expect(all.some((cells) => cells[1] === "1" && cells[2] === "0")).toBe(true);
  });

  it("never shows null, undefined or NaN, with data or without", () => {
    for (const runs of [RUNS, [] as Run[]]) {
      const { container, unmount } = render(<HarnessComparison runs={runs} />);
      const t = container.textContent ?? "";
      expect(t).not.toMatch(/\bnull\b/);
      expect(t).not.toMatch(/undefined/);
      expect(t).not.toMatch(/NaN/);
      unmount();
    }
  });

  it("with no runs, still renders the table with every value cell a dash or a zero count", () => {
    render(<HarnessComparison runs={[]} />);
    const t = table(section());
    expect(bodyRows(t)).toHaveLength(7);
    const cells = bodyRows(t).flatMap((r) => Array.from(r.querySelectorAll("td")).map(text));
    expect(cells.filter((c) => c === "—")).toHaveLength(18);
    expect(cells.filter((c) => c === "0")).toHaveLength(3);
  });
});

describe("HL-014 A4: narrow screens (structure only; the 390 px layout is checked by screenshot)", () => {
  it("the table sits inside its own horizontal scroll container within the section", () => {
    render(<HarnessComparison runs={RUNS} />);
    const root = section();
    let el: HTMLElement | null = table(root).parentElement;
    let found = false;
    while (el && root.contains(el)) {
      if (/\boverflow-x-(auto|scroll)\b/.test(el.className)) { found = true; break; }
      el = el.parentElement;
    }
    expect(found, "an ancestor of the table, inside the section, needs class overflow-x-auto or overflow-x-scroll").toBe(true);
  });
});

describe("HL-014 A2/A3: home page", () => {
  it("has an h2 containing a Compare harnesses button with aria-expanded=false", () => {
    render(<App />);
    const h = screen.getByRole("heading", { level: 2, name: "Compare harnesses" });
    const b = within(h).getByRole("button", { name: "Compare harnesses" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
  });
  it("opening it loads the section (lazy) and sets aria-expanded=true", async () => {
    render(<App />);
    const b = screen.getByRole("button", { name: "Compare harnesses" });
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByRole("region", { name: /compare harnesses/i }, { timeout: 8000 })).toBeTruthy();
  });
  it("App loads the section with React.lazy and has no static import of it", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*["'][^"']*harness-comparison["']\s*\)\s*\)/);
    expect(src).not.toMatch(/^\s*import\s[^;]*from\s*["'][^"']*harness-comparison["']/m);
  });
});
