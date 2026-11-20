// @vitest-environment jsdom
// FROZEN acceptance tests for HL-013 A3-A7 (Unsupported claims section). Builder may not edit this file.
// All inline data is SYNTHETIC. Fixture ids avoid the words null/undefined/NaN on purpose (HL-010b pitfall).
//
// CONTRACT: src/components/claims-audit.tsx, default export ({ runs }: { runs: Run[] }) => JSX.
//   Root: a landmark with role "region" (e.g. <section aria-label="Unsupported claims">), accessible name matching /unsupported claims/i.
//   Totals table (caption; columns Harness, Claims, Unsupported, Rate): one row per harness present; rate as a percent,
//     "—" for a null rate.
//   Claims table (caption; columns Run, Harness, Step, Claim): one body row per unsupported claim, in auditClaims order.
//     Its scroll container (an ancestor of the table) has tabindex="0" and an accessible name (aria-label / aria-labelledby).
//   Harness filter: a <select> with accessible name matching /harness/i whose option values are harness ids (claude-code, codex, team)
//     plus an "all" option as the default. Choosing a harness with no unsupported rows removes the claims table body rows and shows a
//     message matching /no unsupported claims/i.
//   Source line: a <figcaption> or <footer> inside the section whose text matches /source/i and contains the total claim count.
//   App: <h2> containing a <button aria-expanded> named "Unsupported claims"; the section is React.lazy-loaded.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import App from "../src/App";
import ClaimsAudit from "../src/components/claims-audit";
import type { Claim, Harness, Run } from "../src/lib/ingest";

vi.setConfig({ testTimeout: 20000 });
afterEach(cleanup);

const c = (text: string, hasEvidence: boolean, stepIndex: number): Claim => ({ text, hasEvidence, stepIndex });
function mk(harness: Harness, id: string, startedAt: string | null, claims: Claim[]): Run {
  return {
    harness, id, startedAt, endedAt: null, durationMs: null,
    steps: [], toolCalls: [], usage: null, verdicts: [], claims, recordCount: 0, droppedCount: 0,
  };
}
const XSS = "<img src=x onerror=alert(1)>";
// 6 claims in total: claude-code 4 (1 unsupported = 25%), codex 2 (2 unsupported = 100%), team 0 (rate unknown).
const RUNS: Run[] = [
  mk("claude-code", "run-01", "2026-05-01T10:00:00Z", [c("cc supported one", true, 0), c("cc supported two", true, 1), c("cc unsupported one", false, 3), c("cc supported three", true, 4)]),
  mk("codex", "run-02", "2026-05-02T10:00:00Z", [c("cx unsupported one", false, 2), c("cx unsupported two", false, 5)]),
  mk("team", "run-03", "2026-05-02T10:00:00Z", []),
];
const cells = (r: Element) => Array.from(r.querySelectorAll("th, td")).map((x) => (x.textContent ?? "").trim());
const headerNames = (t: Element) => Array.from(t.querySelectorAll("th")).map((x) => (x.textContent ?? "").trim());

function section(): HTMLElement {
  return screen.getByRole("region", { name: /unsupported claims/i });
}
function claimsTable(root: HTMLElement): HTMLTableElement | undefined {
  return Array.from(root.querySelectorAll("table")).find((t) => headerNames(t).some((h) => /^claim$/i.test(h)));
}
function totalsTable(root: HTMLElement): HTMLTableElement | undefined {
  return Array.from(root.querySelectorAll("table")).find((t) => headerNames(t).some((h) => /^rate$/i.test(h)));
}
const bodyRows = (t: Element) => Array.from(t.querySelectorAll("tbody tr"));

describe("HL-013 A4: totals and claims table", () => {
  it("is a named region with a captioned totals table and a captioned claims table", () => {
    render(<ClaimsAudit runs={RUNS} />);
    const s = section();
    const totals = totalsTable(s);
    const claims = claimsTable(s);
    expect(totals, "a table with a Rate column header").toBeTruthy();
    expect(claims, "a table with a Claim column header").toBeTruthy();
    expect((totals!.querySelector("caption")?.textContent ?? "").trim().length).toBeGreaterThan(0);
    expect((claims!.querySelector("caption")?.textContent ?? "").trim().length).toBeGreaterThan(0);
  });
  it("shows claims, unsupported and the rate as a percent per harness, with — for a null rate", () => {
    render(<ClaimsAudit runs={RUNS} />);
    const rows = bodyRows(totalsTable(section())!);
    const row = (h: string) => rows.map(cells).find((r) => r.includes(h));
    const cc = row("claude-code")!;
    expect(cc, "claude-code totals row").toBeTruthy();
    expect(cc).toEqual(expect.arrayContaining(["4", "1"]));
    expect(cc.some((x) => /^25(\.0)?\s*%$/.test(x)), `claude-code ${JSON.stringify(cc)} shows 25%`).toBe(true);
    const cx = row("codex")!;
    expect(cx.some((x) => /^100(\.0)?\s*%$/.test(x)), `codex ${JSON.stringify(cx)} shows 100%`).toBe(true);
    const team = row("team")!;
    expect(team, "team totals row").toBeTruthy();
    expect(team.some((x) => x === "—")).toBe(true);
    for (const r of [cc, cx, team]) for (const x of r) expect(x).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b/i);
    expect(team.some((x) => /^0(\.0)?\s*%$/.test(x)), "team rate is not 0%").toBe(false);
  });
  it("lists exactly the unsupported claims with run, harness, step and text, in audit order", () => {
    render(<ClaimsAudit runs={RUNS} />);
    const rows = bodyRows(claimsTable(section())!).map(cells);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(expect.arrayContaining(["run-01", "claude-code", "3", "cc unsupported one"]));
    expect(rows[1]).toEqual(expect.arrayContaining(["run-02", "codex", "2", "cx unsupported one"]));
    expect(rows[2]).toEqual(expect.arrayContaining(["run-02", "codex", "5", "cx unsupported two"]));
    expect(section().textContent ?? "").not.toContain("cc supported");
  });
});

describe("HL-013 A4: harness filter and empty state", () => {
  const filter = () => within(section()).getByRole("combobox", { name: /harness/i }) as HTMLSelectElement;
  it("narrows the claims table to the chosen harness and restores it on all", () => {
    render(<ClaimsAudit runs={RUNS} />);
    expect(bodyRows(claimsTable(section())!)).toHaveLength(3);
    fireEvent.change(filter(), { target: { value: "claude-code" } });
    let rows = bodyRows(claimsTable(section())!).map(cells);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("cc unsupported one");
    fireEvent.change(filter(), { target: { value: "codex" } });
    rows = bodyRows(claimsTable(section())!).map(cells);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.includes("codex"))).toBe(true);
    const allValue = Array.from(filter().options).map((o) => o.value).find((v) => !["claude-code", "codex", "team"].includes(v));
    expect(allValue, "an option that is none of the harness ids (all)").toBeDefined();
    fireEvent.change(filter(), { target: { value: allValue! } });
    expect(bodyRows(claimsTable(section())!)).toHaveLength(3);
  });
  it("a filter with no rows shows a message, not an empty table", () => {
    render(<ClaimsAudit runs={RUNS} />);
    fireEvent.change(filter(), { target: { value: "team" } });
    const s = section();
    expect(within(s).getByText(/no unsupported claims/i)).toBeTruthy();
    const t = claimsTable(s);
    expect(t === undefined || bodyRows(t).length === 0, "no body rows").toBe(true);
    if (t) expect(bodyRows(t).length, "an empty table is not shown").toBe(0);
  });
  it("with no unsupported claims at all, shows the message and no claim rows", () => {
    render(<ClaimsAudit runs={[mk("codex", "run-04", null, [c("fine", true, 0)])]} />);
    const s = section();
    expect(within(s).getByText(/no unsupported claims/i)).toBeTruthy();
    const t = claimsTable(s);
    expect(t === undefined || bodyRows(t).length === 0).toBe(true);
  });
});

describe("HL-013 A5: claim text is literal", () => {
  it("renders markup in a claim as text and creates no img element", () => {
    const { container } = render(<ClaimsAudit runs={[mk("codex", "run-05", null, [c(XSS, false, 0)])]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(within(section()).getByText(XSS)).toBeTruthy();
  });
});

describe("HL-013 A6: source line", () => {
  it("names the sources and the total claim count in a figcaption or footer", () => {
    render(<ClaimsAudit runs={RUNS} />);
    const lines = Array.from(section().querySelectorAll("figcaption, footer")).map((e) => e.textContent ?? "");
    const line = lines.find((t) => /source/i.test(t));
    expect(line, "a figcaption/footer mentioning Source").toBeTruthy();
    expect(line).toMatch(/\b6\b/);
    expect(line).toMatch(/claims?/i);
  });
  it("the total counts supported claims too and follows the data", () => {
    render(<ClaimsAudit runs={[mk("codex", "run-06", null, [c("a", true, 0), c("b", true, 1), c("c", true, 2), c("d", false, 3), c("e", true, 4), c("f", true, 5), c("g", true, 6)])]} />);
    const line = Array.from(section().querySelectorAll("figcaption, footer")).map((e) => e.textContent ?? "").find((t) => /source/i.test(t));
    expect(line).toMatch(/\b7\b/);
  });
});

describe("HL-013 A7: scrollable region", () => {
  it("the claims table sits in a focusable, named scroll region", () => {
    render(<ClaimsAudit runs={RUNS} />);
    const t = claimsTable(section())!;
    let node: HTMLElement | null = t.parentElement;
    let found: HTMLElement | null = null;
    while (node && node !== document.body) {
      if (node.getAttribute("tabindex") === "0") { found = node; break; }
      node = node.parentElement;
    }
    expect(found, "an ancestor of the claims table with tabindex=0").not.toBeNull();
    const labelledBy = found!.getAttribute("aria-labelledby");
    const name = (found!.getAttribute("aria-label") ?? "").trim() || (labelledBy ? (document.getElementById(labelledBy)?.textContent ?? "").trim() : "");
    expect(name.length, "a non-empty accessible name").toBeGreaterThan(0);
    expect(["region", "group"]).toContain(found!.getAttribute("role"));
  });
});

describe("HL-013 A3: home page disclosure", () => {
  it("has an h2 containing an Unsupported claims button with aria-expanded=false", () => {
    render(<App />);
    const h = screen.getByRole("heading", { level: 2, name: "Unsupported claims" });
    const b = within(h).getByRole("button", { name: "Unsupported claims" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
  });
  it("opening it loads the section (lazy) and sets aria-expanded=true", async () => {
    render(<App />);
    const b = screen.getByRole("button", { name: "Unsupported claims" });
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByRole("region", { name: /unsupported claims/i }, { timeout: 8000 })).toBeTruthy();
  });
  it("App loads the section with React.lazy and has no static import of it", () => {
    const src = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*["'][^"']*claims-audit["']\s*\)\s*\)/);
    expect(src).not.toMatch(/^\s*import\s[^;]*from\s*["'][^"']*claims-audit["']/m);
  });
});
