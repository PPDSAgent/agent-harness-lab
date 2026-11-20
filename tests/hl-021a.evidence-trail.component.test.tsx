// @vitest-environment jsdom
// FROZEN acceptance tests for HL-021a A3 (App wiring), A4, A5, A6, A7. Builder may not edit this file.
// All inline data is SYNTHETIC. Ids avoid the words null/undefined/NaN on purpose (HL-010b pitfall).
//
// CONTRACT: src/components/evidence-trail.tsx, default export
//   EvidenceTrail({ records }: { records?: unknown[] }) => JSX
//   `records` = raw parsed runs/*.json objects (any mode, possibly malformed entries). When omitted, the component loads the real
//   committed runs/*.json itself (import.meta.glob inside this module, so the data stays in the lazy chunk). It builds chains with
//   evidenceChains() from src/lib/evidence-chain.ts.
//   Root: role "region" named /evidence trail/i (e.g. <section aria-label="Evidence trail">).
//   Chart: one POINT per chain, drawn in jsdom WITHOUT layout measurement (plain SVG or fixed width/height; not a bare
//     ResponsiveContainer). A point is an element with role "button" that is focusable (native <button>, or tabIndex=0) and whose
//     accessible name contains BOTH the run id (e.g. 2026-11-08T2139) and the task id (e.g. HL-010a). Activation: click, or Enter
//     or Space keydown on the focused point. Non-point buttons ("Show data table") must not contain a run id in their name.
//   Chain panel: role "region" named /evidence chain/i, absent until a point is activated, then shows that run only. Steps in this
//     order, each introduced by its label text: "Run" (run id, task id, mode), "PR" (link whose href is the PR url, or "not
//     recorded"), "Review verdict" (PASS/CONDITIONAL/FAIL and the review path, or "not recorded"), "Broken check" (file:line and
//     "went red" / "did not go red", or "not recorded"; file:line with an unknown went_red shows "not recorded" for the red status).
//   Data table: button "Show data table" (aria-expanded; label becomes "Hide data table" when open) reveals one <table> with a
//     <caption> and one tbody row per chain (cells in order: run, PR, review, broken check) carrying the same values as the panel.
//   Source line (visible without opening anything): mentions "runs/*.json" and "<N> records" (N = records.length read, including
//     the ones that are not BUILD/FIX).
//   App: <h2> containing a <button aria-expanded> named "Evidence trail"; the section is React.lazy-loaded, no static import.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import App from "../src/App";
import EvidenceTrail from "../src/components/evidence-trail";

vi.setConfig({ testTimeout: 20000 });
afterEach(cleanup);

const rec = (run_date: string, slot: string, mode: string, task_id: string | null, o: Record<string, unknown> = {}) => ({
  schema_version: 3, run_date, slot, mode, task_id, pr_number: null, review: null, mutation_check: null, ...o,
});
const A = rec("2026-02-03", "0900", "BUILD", "HL-901", {
  pr_number: 41,
  review: { verdict: "CONDITIONAL", path: "reviews/2026-02-03T0900-HL-901-r2.md", fix_pass_used: true, unflagged_claims: 0 },
  mutation_check: { file_line: "src/lib/alpha.ts:17", went_red: true },
});
const B = rec("2026-02-03", "1500", "FIX", "HL-901", { pr_number: 41, review: { verdict: "PASS", path: "reviews/2026-02-03T1500-HL-901-r3.md" }, mutation_check: { file_line: "src/lib/beta.ts:5", went_red: false } });
const C = rec("2026-02-04", "0900", "BUILD", "HL-902"); // every link absent
const WAIT = rec("2026-02-03", "1200", "WAIT", null);
const RECORDS: unknown[] = [C, WAIT, B, A, null, "junk"]; // out of order on purpose; 6 records read, 3 chains: A, B, C

const text = (e: Element) => (e.textContent ?? "").trim();
const points = () => screen.queryAllByRole("button", { name: /\d{4}-\d{2}-\d{2}T\d{4}/ });
const point = (runId: string) => {
  const p = points().find((b) => (b.getAttribute("aria-label") ?? text(b)).includes(runId));
  if (!p) throw new Error(`no point for ${runId}; points: ${points().map((b) => b.getAttribute("aria-label") ?? text(b)).join(" | ")}`);
  return p;
};
const panel = () => screen.queryByRole("region", { name: /evidence chain/i });
const BAD = /\bnull\b|undefined|NaN/;

// Emulates what a browser does for a focused element: keydown goes to the handler; a native <button> (or link) additionally
// turns an un-prevented Enter keydown / Space keyup into a click.
function press(el: HTMLElement, key: "Enter" | " ") {
  el.focus();
  expect(document.activeElement, "point must be focusable").toBe(el);
  const proceed = fireEvent.keyDown(el, { key, code: key === " " ? "Space" : "Enter" });
  if (key === " ") fireEvent.keyUp(el, { key, code: "Space" });
  const native = el.tagName === "BUTTON" || el.tagName === "A";
  if (native && proceed) fireEvent.click(el);
}

describe("HL-021a A4: one accessible, activatable point per chain", () => {
  it("draws one point per BUILD/FIX chain with the run id and task in its name, in chronological order", () => {
    render(<EvidenceTrail records={RECORDS} />);
    expect(screen.getByRole("region", { name: /evidence trail/i })).toBeTruthy();
    const names = points().map((b) => b.getAttribute("aria-label") ?? text(b));
    expect(names).toHaveLength(3);
    expect(names[0]).toContain("2026-02-03T0900");
    expect(names[0]).toContain("HL-901");
    expect(names[1]).toContain("2026-02-03T1500");
    expect(names[2]).toContain("2026-02-04T0900");
    expect(names[2]).toContain("HL-902");
  });
  it("every point is reachable by Tab (focusable, tabIndex not negative)", () => {
    render(<EvidenceTrail records={RECORDS} />);
    for (const p of points()) {
      expect(p.tabIndex).toBeGreaterThanOrEqual(0);
      p.focus();
      expect(document.activeElement).toBe(p);
    }
  });
  it("no chain panel until a point is activated", () => {
    render(<EvidenceTrail records={RECORDS} />);
    expect(panel()).toBeNull();
  });
  it("clicking a point shows that run's chain", () => {
    render(<EvidenceTrail records={RECORDS} />);
    fireEvent.click(point("2026-02-03T0900"));
    const p = panel()!;
    expect(p).toBeTruthy();
    expect(text(p)).toContain("2026-02-03T0900");
    expect(text(p)).not.toContain("2026-02-03T1500");
  });
  it("Enter on a focused point shows that run's chain", () => {
    render(<EvidenceTrail records={RECORDS} />);
    press(point("2026-02-03T1500"), "Enter");
    expect(text(panel()!)).toContain("2026-02-03T1500");
  });
  it("Space on a focused point shows that run's chain", () => {
    render(<EvidenceTrail records={RECORDS} />);
    press(point("2026-02-04T0900"), " ");
    expect(text(panel()!)).toContain("2026-02-04T0900");
  });
  it("activating another point replaces the panel (one panel at a time)", () => {
    render(<EvidenceTrail records={RECORDS} />);
    fireEvent.click(point("2026-02-03T0900"));
    fireEvent.click(point("2026-02-04T0900"));
    expect(screen.getAllByRole("region", { name: /evidence chain/i })).toHaveLength(1);
    expect(text(panel()!)).toContain("2026-02-04T0900");
    expect(text(panel()!)).not.toContain("2026-02-03T0900");
  });
});

describe("HL-021a A5: the chain panel", () => {
  it("shows Run, PR, Review verdict, Broken check in that order", () => {
    render(<EvidenceTrail records={RECORDS} />);
    fireEvent.click(point("2026-02-03T0900"));
    const t = text(panel()!);
    const at = ["Run", "PR", "Review verdict", "Broken check"].map((l) => t.search(new RegExp(`(^|[^A-Za-z])${l}([^A-Za-z]|$)`)));
    expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
  });
  it("complete record: run, task, mode, PR link, verdict + path, file:line + went red", () => {
    render(<EvidenceTrail records={RECORDS} />);
    fireEvent.click(point("2026-02-03T0900"));
    const p = panel()!;
    const t = text(p);
    for (const s of ["2026-02-03T0900", "HL-901", "BUILD", "CONDITIONAL", "reviews/2026-02-03T0900-HL-901-r2.md", "src/lib/alpha.ts:17"]) expect(t).toContain(s);
    expect(t).toMatch(/went red/i);
    expect(t).not.toMatch(/did not go red/i);
    expect(t).not.toContain("not recorded");
    const link = within(p).getByRole("link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://github.com/PPDSAgent/harness-lab/pull/41");
    expect(t).not.toMatch(BAD);
  });
  it("a check that did not go red says so", () => {
    render(<EvidenceTrail records={RECORDS} />);
    fireEvent.click(point("2026-02-03T1500"));
    const t = text(panel()!);
    expect(t).toContain("FIX");
    expect(t).toContain("PASS");
    expect(t).toContain("src/lib/beta.ts:5");
    expect(t).toMatch(/did not go red/i);
  });
  it('absent PR, review and broken check each render "not recorded", never null/undefined/NaN/0', () => {
    render(<EvidenceTrail records={RECORDS} />);
    fireEvent.click(point("2026-02-04T0900"));
    const p = panel()!;
    const t = text(p);
    expect(t.match(/not recorded/g) ?? []).toHaveLength(3);
    expect(within(p).queryByRole("link")).toBeNull();
    expect(t).not.toMatch(BAD);
    expect(t).not.toMatch(/(^|[^\d.-])0([^\d]|$)/);
    expect(t).not.toMatch(/PASS|CONDITIONAL|FAIL|went red/i);
  });
  it("a broken check with an unknown red status shows the file:line and not-recorded for the status", () => {
    const D = rec("2026-02-05", "0900", "BUILD", "HL-903", { mutation_check: { file_line: "src/lib/gamma.ts:3" } });
    render(<EvidenceTrail records={[D]} />);
    fireEvent.click(point("2026-02-05T0900"));
    const t = text(panel()!);
    expect(t).toContain("src/lib/gamma.ts:3");
    expect(t).toContain("not recorded");
    expect(t).not.toMatch(/went red|did not go red/i);
    expect(t).not.toMatch(BAD);
  });
});

describe("HL-021a A6: data table alternative", () => {
  it("is hidden until requested; the button toggles with aria-expanded", () => {
    render(<EvidenceTrail records={RECORDS} />);
    expect(document.querySelector("table")).toBeNull();
    const b = screen.getByRole("button", { name: "Show data table" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("table")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide data table" })).toBe(b);
    fireEvent.click(b);
    expect(document.querySelector("table")).toBeNull();
  });
  it("lists every chain with the same four links/values, in chronological order, and no null text", () => {
    render(<EvidenceTrail records={RECORDS} />);
    fireEvent.click(screen.getByRole("button", { name: "Show data table" }));
    const table = document.querySelector("table")!;
    expect(table.querySelector("caption")).toBeTruthy();
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    expect(rows).toHaveLength(3);
    const [r1, r2, r3] = rows.map((r) => r as HTMLElement);
    for (const s of ["2026-02-03T0900", "HL-901", "BUILD", "CONDITIONAL", "reviews/2026-02-03T0900-HL-901-r2.md", "src/lib/alpha.ts:17"]) expect(text(r1), s).toContain(s);
    expect(text(r1)).toMatch(/went red/i);
    expect((within(r1).getByRole("link") as HTMLAnchorElement).getAttribute("href")).toBe("https://github.com/PPDSAgent/harness-lab/pull/41");
    for (const s of ["2026-02-03T1500", "FIX", "PASS", "src/lib/beta.ts:5"]) expect(text(r2), s).toContain(s);
    expect(text(r2)).toMatch(/did not go red/i);
    expect(text(r3)).toContain("2026-02-04T0900");
    expect(text(r3).match(/not recorded/g) ?? []).toHaveLength(3);
    expect(within(r3).queryByRole("link")).toBeNull();
    expect(text(table)).not.toMatch(BAD);
  });
  it("works while the chart is not interacted with (no panel needed)", () => {
    render(<EvidenceTrail records={RECORDS} />);
    fireEvent.click(screen.getByRole("button", { name: "Show data table" }));
    expect(panel()).toBeNull();
  });
});

describe("HL-021a A7: source line", () => {
  it("says the data is the team's own run records (runs/*.json) and how many were read", () => {
    render(<EvidenceTrail records={RECORDS} />);
    const t = text(screen.getByRole("region", { name: /evidence trail/i }));
    expect(t).toContain("runs/*.json");
    expect(t).toMatch(/\b6\s+(run\s+)?records?\b/i);
  });
  it("an empty record list renders with 0 records and no points, without crashing", () => {
    render(<EvidenceTrail records={[]} />);
    expect(points()).toHaveLength(0);
    const t = text(screen.getByRole("region", { name: /evidence trail/i }));
    expect(t).toMatch(/\b0\s+(run\s+)?records?\b/i);
    expect(t).not.toMatch(BAD);
  });
});

describe("HL-021a A3/A4/A7: home page with the real committed runs/*.json", () => {
  const RUNS_DIR = path.resolve(process.cwd(), "runs");
  const recs = readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(RUNS_DIR, f), "utf8")) as { mode: string });
  const chains = recs.filter((r) => r.mode === "BUILD" || r.mode === "FIX").length;

  it("has an h2 containing an Evidence trail button with aria-expanded=false, and no section yet", () => {
    render(<App />);
    const h = screen.getByRole("heading", { level: 2, name: "Evidence trail" });
    expect(within(h).getByRole("button", { name: "Evidence trail" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: /evidence trail/i })).toBeNull();
  });
  it("opening it loads the section lazily: one point per committed BUILD/FIX run, source line counts every record", async () => {
    render(<App />);
    const b = screen.getByRole("button", { name: "Evidence trail" });
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    const region = await screen.findByRole("region", { name: /evidence trail/i }, { timeout: 8000 });
    expect(points()).toHaveLength(chains);
    expect(text(region)).toContain("runs/*.json");
    expect(text(region)).toMatch(new RegExp(`\\b${recs.length}\\s+(run\\s+)?records?\\b`, "i"));
    fireEvent.click(points()[0]!);
    expect(panel()).toBeTruthy();
  });
  it("App loads the section with React.lazy and has no static import of it", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*["'][^"']*evidence-trail["']\s*\)\s*\)/);
    expect(src).not.toMatch(/^\s*import\s[^;]*from\s*["'][^"']*evidence-trail["']/m);
    expect(src).not.toMatch(/^\s*import\s[^;]*from\s*["'][^"']*evidence-chain["']/m);
  });
});
