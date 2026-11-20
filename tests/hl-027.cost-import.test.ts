// @vitest-environment node
// FROZEN acceptance tests for HL-027 (cost-export importer CLI; criteria C1 to C11).
// Written by the test engineer before the build; the builder may not edit this file or
// fixtures/cost/. All fixtures are SYNTHETIC. The export layout is an ASSUMPTION (see the
// task block); tests call `main(argv, io)` from src/cli/cost.ts in-process.
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "..");
const FX = join(REPO, "fixtures/cost");
const EXPORT = "fixtures/cost/export-main.csv";
const run = (n: string) => `fixtures/cost/runs/${n}.json`;

interface Io { stdout: { write(c: string): unknown }; stderr: { write(c: string): unknown }; cwd?: string }
type CostMain = (argv: string[], io: Io) => number | Promise<number>;
type Res = { code: number; out: string; err: string };

async function cost(argv: string[], cwd: string = REPO): Promise<Res> {
  const mod = (await import("../src/cli/cost")) as { main?: CostMain };
  expect(typeof mod.main, "src/cli/cost.ts must export main(argv, io)").toBe("function");
  let out = "";
  let err = "";
  const code = await (mod.main as CostMain)(argv, {
    stdout: { write: (c: string) => ((out += c), true) },
    stderr: { write: (c: string) => ((err += c), true) },
    cwd,
  });
  return { code, out, err };
}

interface Entry {
  file: string; started_at: string; finished_at: string | null;
  cost_usd: number | null; rows: number; reason: string;
}
async function ok(argv: string[]): Promise<{ source: string; runs: Entry[] }> {
  const r = await cost(argv);
  expect(r.code, r.err).toBe(0);
  const lines = r.out.split("\n").filter((l) => l.trim() !== "");
  expect(lines.length).toBe(1);
  return JSON.parse(lines[0]) as { source: string; runs: Entry[] };
}
async function one(exportPath: string, runPath: string): Promise<Entry> {
  const o = await ok([exportPath, runPath]);
  expect(o.runs.length).toBe(1);
  return o.runs[0];
}

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "hl027-"));
  tmpDirs.push(d);
  return d;
}
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

const HDR = "starting_at,ending_at,amount,currency";
const GOOD = "2026-11-10T10:00:00Z,2026-11-10T11:00:00Z,1,USD";
function csv(lines: string[]): string {
  const d = tmp();
  const p = join(d, "export.csv");
  writeFileSync(p, ["# SYNTHETIC inline export for HL-027", ...lines].join("\n") + "\n");
  return p;
}
function tmpRun(): string {
  const d = tmp();
  const p = join(d, "run.json");
  cpSync(join(REPO, run("sum")), p);
  return p;
}

describe("HL-027 fixtures and script", () => {
  it("C0: every fixture exists and says SYNTHETIC in its header", () => {
    for (const n of ["export-main", "export-shuffled", "export-marker"]) {
      const p = join(FX, `${n}.csv`);
      expect(existsSync(p), p).toBe(true);
      const first = readFileSync(p, "utf8").split("\n")[0];
      expect(first.startsWith("#"), p).toBe(true);
      expect(first).toContain("SYNTHETIC");
    }
    const runs = readdirSync(join(FX, "runs")).filter((f) => f.endsWith(".json"));
    expect(runs.length).toBeGreaterThanOrEqual(15);
    for (const f of runs) {
      const text = readFileSync(join(FX, "runs", f), "utf8");
      expect(text, f).toContain("SYNTHETIC");
      expect(text, f).not.toMatch(/\/(Users|home)\/(?!demo|synthetic)/);
    }
  });

  it("C11: package.json has script `cost` = `tsx src/cli/cost.ts`", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
    expect(pkg.scripts.cost).toBe("tsx src/cli/cost.ts");
  });
});

describe("HL-027 C1 sum of inside rows", () => {
  it("C1: several rows per bucket across two buckets sum to the exact figure; rows counted", async () => {
    const e = await one(EXPORT, run("sum"));
    expect(e.cost_usd).toBe(2.05);
    expect(e.rows).toBe(4);
    expect(e.reason).toMatch(/4/);
  });

  it("C1: the sum is rounded to 6 decimal places", async () => {
    const e = await one(EXPORT, run("round"));
    expect(e.cost_usd).toBe(0.123456);
    expect(e.rows).toBe(2);
  });

  it("C1: output shape is {source, runs[...]} with the six keys, file as given, in argument order", async () => {
    const o = await ok([EXPORT, run("round"), run("sum")]);
    expect(Object.keys(o).sort()).toEqual(["runs", "source"]);
    expect(typeof o.source).toBe("string");
    expect(o.source.length).toBeGreaterThan(0);
    expect(o.runs.map((r) => r.file)).toEqual([run("round"), run("sum")]);
    for (const r of o.runs) {
      expect(Object.keys(r).sort()).toEqual(["cost_usd", "file", "finished_at", "reason", "rows", "started_at"]);
    }
    expect(o.runs[1]).toMatchObject({
      started_at: "2026-11-10T10:00:00Z", finished_at: "2026-11-10T12:00:00Z", cost_usd: 2.05, rows: 4,
    });
    expect(o.runs[0].cost_usd).toBe(0.123456);
  });

  it("C1: adjacent runs sharing a boundary each take their own bucket", async () => {
    const o = await ok([EXPORT, run("adj-a"), run("adj-b")]);
    expect(o.runs[0]).toMatchObject({ cost_usd: 7, rows: 1 });
    expect(o.runs[1]).toMatchObject({ cost_usd: 8, rows: 1 });
  });

  it("C1: a file path is resolved against io.cwd", async () => {
    const r = await cost(["fixtures/cost/export-main.csv", run("sum")], REPO);
    expect(r.code, r.err).toBe(0);
    const r2 = await cost(["export-main.csv", "runs/sum.json"], FX);
    expect(r2.code, r2.err).toBe(0);
    expect((JSON.parse(r2.out) as { runs: Entry[] }).runs[0].file).toBe("runs/sum.json");
  });
});

describe("HL-027 C2 / C3 ambiguity", () => {
  it("C2: a bucket straddling the run window gives null + ambiguous", async () => {
    const e = await one(EXPORT, run("straddle"));
    expect(e.cost_usd).toBeNull();
    expect(e.reason).toContain("ambiguous");
    expect(e.rows).toBe(0);
  });

  it("C2: a run that ends mid-bucket after summable rows is still null + ambiguous", async () => {
    const e = await one(EXPORT, run("partial"));
    expect(e.cost_usd).toBeNull();
    expect(e.reason).toContain("ambiguous");
    expect(e.rows).toBe(0);
  });

  it("C3: a bucket inside two overlapping runs on one command line makes both null + ambiguous", async () => {
    const o = await ok([EXPORT, run("shared-a"), run("shared-b")]);
    for (const r of o.runs) {
      expect(r.cost_usd).toBeNull();
      expect(r.reason).toContain("ambiguous");
      expect(r.rows).toBe(0);
    }
  });

  it("C3: the same run alone is not ambiguous (only the other run on the line makes it so)", async () => {
    const e = await one(EXPORT, run("shared-a"));
    expect(e.cost_usd).toBe(5);
    expect(e.rows).toBe(1);
  });

  it("C3: unrelated runs on the same line do not disturb each other", async () => {
    const o = await ok([EXPORT, run("sum"), run("round"), run("nomatch")]);
    expect(o.runs.map((r) => r.cost_usd)).toEqual([2.05, 0.123456, null]);
  });
});

describe("HL-027 C4 / C5 null cases", () => {
  it("C4: no overlapping row gives null + no match", async () => {
    const e = await one(EXPORT, run("nomatch"));
    expect(e.cost_usd).toBeNull();
    expect(e.reason).toContain("no match");
    expect(e.rows).toBe(0);
  });

  it("C4: a bucket that starts exactly at finished_at does not overlap (half-open)", async () => {
    const e = await one(EXPORT, run("boundary"));
    expect(e.cost_usd).toBeNull();
    expect(e.reason).toContain("no match");
  });

  it("C5: finished_at null gives null + no finished_at", async () => {
    const e = await one(EXPORT, run("open"));
    expect(e.cost_usd).toBeNull();
    expect(e.finished_at).toBeNull();
    expect(e.reason).toContain("no finished_at");
    expect(e.rows).toBe(0);
  });
});

describe("HL-027 C6 header parsing", () => {
  it("C6: comment lines, blank lines, shuffled columns, quoted commas and doubled quotes, extra columns", async () => {
    const e = await one("fixtures/cost/export-shuffled.csv", run("sum"));
    expect(e.cost_usd).toBe(2.05);
    expect(e.rows).toBe(4);
  });

  it("C6: a missing required column exits 2 and stderr names it; stdout is empty", async () => {
    const p = csv(["starting_at,ending_at,amount", "2026-11-10T10:00:00Z,2026-11-10T11:00:00Z,1"]);
    const r = await cost([p, run("sum")]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("currency");
    expect(r.out).toBe("");
  });

  it("C6: stderr names every missing column", async () => {
    const p = csv(["starting_at,amount,model", "2026-11-10T10:00:00Z,1,m"]);
    const r = await cost([p, run("sum")]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("ending_at");
    expect(r.err).toContain("currency");
    expect(r.out).toBe("");
  });

  it("C6: an export with comments only (no header) exits 2", async () => {
    const p = csv(["# only a comment"]);
    const r = await cost([p, run("sum")]);
    expect(r.code).toBe(2);
    expect(r.err.length).toBeGreaterThan(0);
    expect(r.out).toBe("");
  });

  it("C6: a header with no data rows is valid; the run is null + no match", async () => {
    const p = csv([HDR]);
    const e = await one(p, run("sum"));
    expect(e.cost_usd).toBeNull();
    expect(e.reason).toContain("no match");
  });
});

describe("HL-027 C7 bad data rows", () => {
  // Line layout: 1 comment (added by csv()), 2 header, 3 comment, 4 good, 5 blank, 6 good, 7 bad.
  function withBad(bad: string): string {
    return csv([HDR, "# note", GOOD, "", GOOD, bad]);
  }
  const cases: Array<[string, string, string, string]> = [
    ["unparsable starting_at", "BADTS-VAL,2026-11-10T11:00:00Z,1,USD", "starting_at", "BADTS-VAL"],
    ["unparsable ending_at", "2026-11-10T10:00:00Z,BADTE-VAL,1,USD", "ending_at", "BADTE-VAL"],
    ["non-numeric amount", "2026-11-10T10:00:00Z,2026-11-10T11:00:00Z,BADAMT-VAL,USD", "amount", "BADAMT-VAL"],
    ["ending_at before starting_at", "2026-11-10T13:41:00Z,2026-11-10T12:07:00Z,1,USD", "ending_at", "2026-11-10T12:07:00Z"],
    ["ending_at equal to starting_at", "2026-11-10T13:41:00Z,2026-11-10T13:41:00Z,1,USD", "ending_at", "2026-11-10T13:41:00Z"],
    ["non-USD currency", "2026-11-10T10:00:00Z,2026-11-10T11:00:00Z,1,ZZY", "currency", "ZZY"],
  ];
  for (const [label, row, col, value] of cases) {
    it(`C7: ${label} exits 2, names line 7 and column ${col}, never the value`, async () => {
      const r = await cost([withBad(row), run("sum")]);
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/\b7\b/);
      expect(r.err).toContain(col);
      expect(r.err).not.toContain(value);
      expect(r.out).toBe("");
    });
  }

  it("C7: a bad row writes no run file even with --write", async () => {
    const rp = tmpRun();
    const before = readFileSync(rp, "utf8");
    const r = await cost(["--write", withBad("2026-11-10T10:00:00Z,2026-11-10T11:00:00Z,x,USD"), rp]);
    expect(r.code).toBe(2);
    expect(readFileSync(rp, "utf8")).toBe(before);
  });
});

describe("HL-027 C8 privacy", () => {
  const MARK = "PRIVACY-MARKER-7f3a9c";
  it("C8: a marker in the description column never reaches stdout or stderr (success)", async () => {
    const r = await cost(["fixtures/cost/export-marker.csv", run("sum"), run("nomatch")]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).not.toContain(MARK);
    expect(r.err).not.toContain(MARK);
    const o = JSON.parse(r.out) as { runs: Entry[] };
    expect(o.runs[0].cost_usd).toBe(4);
    expect(o.runs[0].rows).toBe(2);
  });

  it("C8: nor on an error path (bad row carrying the marker)", async () => {
    const p = csv([`${HDR},description`, GOOD + `,${MARK}`, `2026-11-10T10:00:00Z,2026-11-10T11:00:00Z,oops,USD,${MARK}`]);
    const r = await cost([p, run("sum")]);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain(MARK);
    expect(r.err).not.toContain(MARK);
  });
});

describe("HL-027 C9 --write", () => {
  it("C9: --write sets only cost_usd; other keys deep-equal and in order; 2-space JSON plus newline", async () => {
    const d = tmp();
    const rp = join(d, "full.json");
    cpSync(join(REPO, run("full")), rp);
    const before = JSON.parse(readFileSync(rp, "utf8")) as Record<string, unknown>;
    const r = await cost(["--write", join(REPO, EXPORT), rp]);
    expect(r.code, r.err).toBe(0);
    const o = JSON.parse(r.out) as { runs: Entry[] };
    expect(o.runs[0].cost_usd).toBe(2.05);
    const text = readFileSync(rp, "utf8");
    const after = JSON.parse(text) as Record<string, unknown>;
    expect(after.cost_usd).toBe(2.05);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    const restAfter = { ...after };
    const restBefore = { ...before };
    delete restAfter.cost_usd;
    delete restBefore.cost_usd;
    expect(restAfter).toEqual(restBefore);
    expect(text).toBe(JSON.stringify(after, null, 2) + "\n");
  });

  it("C9: a missing cost_usd key is added and every other key keeps its order", async () => {
    const d = tmp();
    const rp = join(d, "nocost.json");
    cpSync(join(REPO, run("nocost")), rp);
    const before = JSON.parse(readFileSync(rp, "utf8")) as Record<string, unknown>;
    const r = await cost(["--write", join(REPO, EXPORT), rp]);
    expect(r.code, r.err).toBe(0);
    const after = JSON.parse(readFileSync(rp, "utf8")) as Record<string, unknown>;
    expect(after.cost_usd).toBe(2.05);
    expect(Object.keys(after).filter((k) => k !== "cost_usd")).toEqual(Object.keys(before));
  });

  it("C9: --write sets cost_usd to null (explicitly) for an ambiguous run", async () => {
    const d = tmp();
    const rp = join(d, "straddle.json");
    cpSync(join(REPO, run("straddle")), rp);
    const r = await cost(["--write", join(REPO, EXPORT), rp]);
    expect(r.code, r.err).toBe(0);
    const after = JSON.parse(readFileSync(rp, "utf8")) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(after, "cost_usd")).toBe(true);
    expect(after.cost_usd).toBeNull();
  });

  it("C9: --write may come after the other arguments and updates every run file", async () => {
    const d = tmp();
    const a = join(d, "a.json");
    const b = join(d, "b.json");
    cpSync(join(REPO, run("sum")), a);
    cpSync(join(REPO, run("round")), b);
    const r = await cost([join(REPO, EXPORT), a, b, "--write"]);
    expect(r.code, r.err).toBe(0);
    expect((JSON.parse(readFileSync(a, "utf8")) as { cost_usd: number }).cost_usd).toBe(2.05);
    expect((JSON.parse(readFileSync(b, "utf8")) as { cost_usd: number }).cost_usd).toBe(0.123456);
  });

  it("C9: without --write every run file is byte-identical afterwards", async () => {
    const d = tmp();
    const a = join(d, "a.json");
    const b = join(d, "b.json");
    cpSync(join(REPO, run("full")), a);
    cpSync(join(REPO, run("straddle")), b);
    const ba = readFileSync(a);
    const bb = readFileSync(b);
    const r = await cost([join(REPO, EXPORT), a, b]);
    expect(r.code, r.err).toBe(0);
    expect(readFileSync(a).equals(ba)).toBe(true);
    expect(readFileSync(b).equals(bb)).toBe(true);
  });
});

describe("HL-027 C10 usage and file errors", () => {
  it("C10: no arguments exits 2 with a message on stderr and nothing on stdout", async () => {
    const r = await cost([]);
    expect(r.code).toBe(2);
    expect(r.err.length).toBeGreaterThan(0);
    expect(r.out).toBe("");
  });

  it("C10: one path exits 2", async () => {
    const r = await cost([EXPORT]);
    expect(r.code).toBe(2);
    expect(r.err.length).toBeGreaterThan(0);
    expect(r.out).toBe("");
  });

  it("C10: --write with only one path exits 2", async () => {
    const r = await cost(["--write", EXPORT]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
  });

  it("C10: an unreadable export exits 2", async () => {
    const r = await cost(["fixtures/cost/does-not-exist.csv", run("sum")]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("does-not-exist.csv");
    expect(r.out).toBe("");
  });

  it("C10: an unreadable run file exits 2 and names it", async () => {
    const r = await cost([EXPORT, run("sum"), "fixtures/cost/runs/missing-run.json"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("missing-run.json");
    expect(r.out).toBe("");
  });

  it("C10: a run file that is not a JSON object exits 2", async () => {
    const r = await cost([EXPORT, run("not-object")]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("not-object.json");
    expect(r.out).toBe("");
  });

  it("C10: a run file that is not JSON at all exits 2", async () => {
    const d = tmp();
    const p = join(d, "junk.json");
    writeFileSync(p, "{ SYNTHETIC not json");
    const r = await cost([EXPORT, p]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
  });

  it("C10: a run file with an unparsable started_at exits 2 and names the file", async () => {
    const r = await cost([EXPORT, run("bad-started")]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("bad-started.json");
    expect(r.out).toBe("");
  });

  it("C10: any error means no file is written, even a valid run given alongside with --write", async () => {
    const d = tmp();
    const good = join(d, "good.json");
    cpSync(join(REPO, run("sum")), good);
    const before = readFileSync(good, "utf8");
    const r = await cost(["--write", join(REPO, EXPORT), good, join(REPO, run("bad-started"))]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(readFileSync(good, "utf8")).toBe(before);
  });

  it("C10: success exits 0 even when every run is null", async () => {
    const r = await cost([EXPORT, run("nomatch"), run("open")]);
    expect(r.code, r.err).toBe(0);
    const o = JSON.parse(r.out) as { runs: Entry[] };
    expect(o.runs.map((x) => x.cost_usd)).toEqual([null, null]);
  });
});
