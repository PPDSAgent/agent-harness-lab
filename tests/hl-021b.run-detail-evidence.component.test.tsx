// @vitest-environment jsdom
// FROZEN acceptance tests for HL-021b B2, B3, B4. Builder may not edit this file. Data is the repo's own committed runs/*.json
// (synthetic team records), read through the real App, so these tests fix behaviour, not the props of any new component.
//
// CONTRACT
//   B2  The run detail of a team run shows a block: role "region" named /evidence chain/i (e.g. <section aria-label="Evidence chain">),
//       rendered (lazily, so wait for it) inside the run detail. Content for the run's chain (evidenceChain of the matching record):
//       - PR: a link whose accessible name contains `#<n>` and whose href is the PR url; when pr is absent no link and the DASH "—".
//       - Review: the verdict word (PASS/CONDITIONAL/FAIL) and the review file path as text; when absent "—".
//       - Broken check: the `file:line` and "went red" (wentRed true) or "did not go red" (false); when absent "—".
//       The block text never contains the words null, undefined or NaN. A claude-code or codex run's detail has no such block.
//   B3  RunsList has a filter button named "Team" (aria-pressed like the others). With it, the runs table lists every team run (one row
//       per runs/*.json file) and the run id button opens its run detail. NOTE for the lead: tests/hl-010a* freeze 90 rows by default
//       ("All"), so these tests do not assert the "All" count; they assert Team lists the team runs.
//   B4  See the describe block below.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import App from "../src/App";
import { evidenceChain } from "../src/lib/evidence-chain";
import { DASH } from "../src/lib/format-duration";

vi.setConfig({ testTimeout: 30000 });
afterEach(cleanup);

const RUNS_DIR = path.resolve(process.cwd(), "runs");
const FILES = readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json"));
const RECORDS = FILES.map((f) => JSON.parse(readFileSync(path.join(RUNS_DIR, f), "utf8")) as Record<string, unknown>);
const byId = (id: string) => RECORDS.find((r) => `${r.run_date}T${r.slot}` === id)!;
const text = (e: Element) => (e.textContent ?? "").trim();
const BAD = /\bnull\b|undefined|NaN/;

// Full chain (PR 14, PASS, broken check went red); two with missing links; one SECURITY run with no chain links at all.
const FULL = "2026-11-03T1538";
const NO_PR = "2026-11-12T0943"; // pr_number null, review and check present
const NOTHING = "2026-11-09T0041"; // pr_number null, review null, mutation_check null
const SECURITY = "2026-11-03T0339";

async function openTeamRun(id: string) {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Team" }));
  fireEvent.click(screen.getByRole("button", { name: id }));
  return screen.findByRole("region", { name: /evidence chain/i }, { timeout: 8000 });
}

describe("HL-021b B3: team runs are reachable from the runs list", () => {
  it("fixtures exist for the cases below", () => {
    expect(evidenceChain(byId(FULL)).pr?.number).toBe(14);
    expect(evidenceChain(byId(NO_PR)).pr).toBeNull();
    expect(evidenceChain(byId(NOTHING))).toMatchObject({ pr: null, review: null, brokenCheck: null });
  });
  it("a Team filter button exists, unpressed at first", async () => {
    render(<App />);
    const b = await screen.findByRole("button", { name: "Team" }, { timeout: 8000 });
    expect(b.getAttribute("aria-pressed")).toBe("false");
  });
  it("with Team pressed the runs table lists one row per runs/*.json record and the run ids", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Team" }));
    expect(screen.getByRole("button", { name: "Team" }).getAttribute("aria-pressed")).toBe("true");
    const table = screen.getByRole("table", { name: /runs/i });
    const rows = table.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(FILES.length);
    expect(text(table)).toContain(FULL);
    expect(text(table)).toContain(NOTHING);
  });
  it("opening a team run shows its run detail (heading Run <id>) with the Evidence chain block", async () => {
    const block = await openTeamRun(FULL);
    expect(screen.getByRole("heading", { name: `Run ${FULL}` })).toBeTruthy();
    expect(block).toBeTruthy();
  });
});

describe("HL-021b B2: the Evidence chain block in a team run's detail", () => {
  it("complete chain: PR link #14 to the GitHub PR url, verdict, review path, file:line and went red", async () => {
    const chain = evidenceChain(byId(FULL));
    const block = await openTeamRun(FULL);
    const link = within(block).getByRole("link", { name: /#14\b/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://github.com/PPDSAgent/harness-lab/pull/14");
    const t = text(block);
    expect(t).toContain(chain.review!.verdict);
    expect(t).toContain(chain.review!.path);
    expect(t).toContain(chain.brokenCheck!.fileLine);
    expect(t).toMatch(/went red/i);
    expect(t).not.toMatch(/did not go red/i);
    expect(t).not.toMatch(BAD);
  });
  it("a missing PR link shows the dash, no link and no null/undefined/NaN; the rest of the chain still shows", async () => {
    const chain = evidenceChain(byId(NO_PR));
    const block = await openTeamRun(NO_PR);
    const t = text(block);
    expect(within(block).queryAllByRole("link").filter((a) => /github\.com\/.*\/pull\//.test(a.getAttribute("href") ?? ""))).toHaveLength(0);
    expect(t).toContain(DASH);
    expect(t).toContain(chain.review!.verdict);
    expect(t).toContain(chain.review!.path);
    expect(t).toContain(chain.brokenCheck!.fileLine);
    expect(t).not.toMatch(BAD);
  });
  it("a run with no PR, no review and no broken check shows a dash for each (at least 3) and no bad text", async () => {
    const block = await openTeamRun(NOTHING);
    const t = text(block);
    expect((t.match(new RegExp(DASH, "g")) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(t).not.toMatch(BAD);
    expect(within(block).queryAllByRole("link")).toHaveLength(0);
    expect(t).not.toMatch(/\bPASS\b|\bCONDITIONAL\b|\bFAIL\b/);
  });
  it("a team run of another mode (SECURITY) shows the block with dashes only", async () => {
    const block = await openTeamRun(SECURITY);
    expect(text(block)).toContain(DASH);
    expect(text(block)).not.toMatch(BAD);
  });
  it("the block sits inside the run detail section (labelled by the run heading)", async () => {
    const block = await openTeamRun(FULL);
    const detail = block.closest("section[aria-labelledby='run-detail-heading']") ?? block.closest("[aria-labelledby='run-detail-heading']");
    expect(detail, "block must be inside the run detail").not.toBeNull();
  });
  it("a claude-code run's detail has no Evidence chain block", async () => {
    render(<App />);
    const table = await screen.findByRole("table", { name: /runs/i });
    fireEvent.click(within(table).getAllByRole("button")[0]!);
    await screen.findByRole("heading", { name: /^Run / });
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole("region", { name: /evidence chain/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Evidence chain/i);
  });
  it("a codex run's detail has no Evidence chain block", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Codex" }));
    const table = screen.getByRole("table", { name: /runs/i });
    fireEvent.click(within(table).getAllByRole("button")[0]!);
    await screen.findByRole("heading", { name: /^Run / });
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole("region", { name: /evidence chain/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Evidence chain/i);
  });
});

// B4. From the existing charts. CONTRACT: with the "Eval pass rate" section open (toggle aria-expanded=true), and separately the
// "Cost, tokens and latency" section open, a NEW button or link appears (not present with the section closed) whose accessible name
// matches /evidence trail/i. Activating it sets the main "Evidence trail" toggle (the h2 button present from the start) to
// aria-expanded="true" and moves keyboard focus to the Evidence trail section: document.activeElement is the region named
// /evidence trail/i (it needs tabIndex=-1) or an element inside it. The section loads lazily, so focus may arrive after a wait.
const trailControls = () => [...screen.queryAllByRole("button", { name: /evidence trail/i }), ...screen.queryAllByRole("link", { name: /evidence trail/i })];

describe.each([
  ["Eval pass rate", "Eval pass rate"],
  ["Cost, tokens and latency", "Cost, tokens and latency"],
])("HL-021b B4: %s links to the Evidence trail", (_label, toggleName) => {
  it("when open, shows a control that opens the Evidence trail and moves focus to it", async () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Evidence trail" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const before = new Set(trailControls());
    expect(before.has(toggle)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: toggleName }));
    expect(screen.getByRole("button", { name: toggleName }).getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(trailControls().filter((c) => !before.has(c)).length).toBeGreaterThan(0), { timeout: 8000 });
    const control = trailControls().find((c) => !before.has(c))!;
    expect(["BUTTON", "A"]).toContain(control.tagName);
    fireEvent.click(control);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await waitFor(
      () => {
        const region = screen.getByRole("region", { name: /evidence trail/i });
        const active = document.activeElement;
        expect(active === region || (active !== null && region.contains(active)), `focus is on ${active?.tagName} ${active?.getAttribute("aria-label") ?? ""}`).toBe(true);
      },
      { timeout: 8000 },
    );
  });
  it("with the section closed there is no extra control (only the section toggle names the trail)", () => {
    render(<App />);
    expect(trailControls()).toHaveLength(1);
  });
});
