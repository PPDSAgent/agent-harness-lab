// @vitest-environment node
// FROZEN acceptance tests for HL-020 (recurring P1 stop check: `ingest --stop-check`; criteria A1..A7).
// Written by the test engineer before the build; the builder may not edit this file.
// All data is SYNTHETIC: the committed fixtures plus temp dirs created (and removed) at test time.
// The pseudonymisation key is generated at test time in a temp dir outside any git tree.
//
// PUBLIC CONTRACT (src/cli/ingest.ts, same entry point as HL-017):
//   main(argv, { stdout, stderr, env?, cwd? }): Promise<number>
//   New boolean flag:  --stop-check          (all HL-017 flags still apply: sources + --key-file)
//   New value flag:    --now <YYYY-MM-DD>    (the date of this check; injected so tests are deterministic.
//                                             Without it the CLI uses today's date. A malformed value is a usage error.)
//   stdout carries ONLY these lines (blank lines allowed), and nothing else:
//     Q1 which skill fails most often: yes|no
//     Q2 what each scheduled run costs: yes|no
//     Q3 which claims lack evidence: yes|no
//     three questions answered: yes|no
//     unanswered: Q2, Q3        (comma+space separated, ascending)  or  unanswered: none
//     stop rule P1: tripped|not tripped
//     <one line containing "Has it changed a decision about Clark?">   (a reminder; the CLI records no answer)
//   "yes" for a question means answerP1Questions() status is not "no-data". In particular Q1 status
//   "no-failures" (skill calls exist, none failed) is ANSWERED -> "yes".
//   No run ids, skill names, claim text, costs, counts, pseudonyms, paths or key material on stdout or stderr.
//   Files, all relative to io.cwd, which must be a git working tree where `git check-ignore` confirms the path is ignored:
//     local/stop-check/<name>.json   one full report per check (any file name ending in .json, JSON, holds per-question details)
//     local/stop-check/history.jsonl one line appended per check:  {"date":"YYYY-MM-DD","q1":"yes|no","q2":"yes|no","q3":"yes|no"}
//   If the path is not confirmed ignored (or history.jsonl is tracked), the CLI refuses: non-zero exit, writes nothing.
//   Trip rule: after appending this check to the history, the LAST THREE entries each have date strictly after
//   2026-11-06 and each has at least one "no"  ->  "stop rule P1: tripped"; otherwise "not tripped".
//   Exit codes: 0 when the check ran (whatever the answers); 2 for usage errors (unknown flag, no source, no key,
//   key file inside a git tree, bad --now, any output-file option such as --out).
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseClaudeCode, parseCodex, parseRunRecord } from "../src/lib/ingest";
import type { Run } from "../src/lib/ingest";
import { answerP1Questions } from "../src/lib/p1-questions";
import { main } from "../src/cli/ingest";

const REPO = resolve(__dirname, "..");
const CC = join(REPO, "fixtures/claude-code");
const CX = join(REPO, "fixtures/codex");
const RUNS = join(REPO, "runs");

const files = (dir: string, ext: string) => readdirSync(dir).filter((f) => f.endsWith(ext)).sort();
const load = (dir: string, ext: string, parse: (s: string) => Run) =>
  files(dir, ext).map((f) => parse(readFileSync(join(dir, f), "utf8")));

type Cap = { code: number; out: string; err: string };
async function run(argv: string[], cwd: string, env: Record<string, string> = {}): Promise<Cap> {
  let out = "";
  let err = "";
  const io = {
    stdout: { write: (c: string | Uint8Array) => ((out += String(c)), true) },
    stderr: { write: (c: string | Uint8Array) => ((err += String(c)), true) },
    env,
    cwd,
  };
  const code = await main(argv, io as any);
  return { code, out, err };
}

const porcelain = () => execFileSync("git", ["status", "--porcelain"], { cwd: REPO, encoding: "utf8" });

let tmp: string;
let keyFile: string;
let keyText: string;
let statusBefore: string;
beforeAll(() => {
  statusBefore = porcelain();
  tmp = mkdtempSync(join(tmpdir(), "hl020-"));
  keyText = randomBytes(24).toString("hex");
  keyFile = join(tmp, "key.txt");
  writeFileSync(keyFile, keyText);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** A fresh temp git working tree whose .gitignore holds `ignore` (null = no .gitignore at all). */
function gitCwd(ignore: string | null = "/local/\n"): string {
  const d = mkdtempSync(join(tmp, "cwd-"));
  execFileSync("git", ["init", "-q"], { cwd: d });
  if (ignore !== null) writeFileSync(join(d, ".gitignore"), ignore);
  return d;
}
const FULL = ["--claude-code", CC, "--codex", CX, "--runs", RUNS];
const args = (srcs: string[], now: string, extra: string[] = []) => ["--stop-check", ...srcs, "--key-file", keyFile, "--now", now, ...extra];
const dirOf = (cwd: string) => join(cwd, "local/stop-check");
const reports = (cwd: string) => (existsSync(dirOf(cwd)) ? readdirSync(dirOf(cwd)).filter((f) => f.endsWith(".json")) : []);
const historyOf = (cwd: string) => {
  const p = join(dirOf(cwd), "history.jsonl");
  return existsSync(p) ? readFileSync(p, "utf8").split("\n").filter((l) => l.trim() !== "") : [];
};
const seed = (cwd: string, rows: Array<[string, "yes" | "no", "yes" | "no", "yes" | "no"]>) => {
  mkdirSync(dirOf(cwd), { recursive: true });
  writeFileSync(
    join(dirOf(cwd), "history.jsonl"),
    rows.map(([date, q1, q2, q3]) => JSON.stringify({ date, q1, q2, q3 })).join("\n") + "\n",
  );
};

// Expected answers are derived from the existing library at test time, not remembered.
const yn = (s: string) => (s === "no-data" ? "no" : "yes");
function expected(runs: Run[]) {
  const a = answerP1Questions(runs);
  return [yn(a.skillFailures.status), yn(a.runCost.status), yn(a.unsupportedClaims.status)];
}
const ccRuns = () => load(CC, ".jsonl", parseClaudeCode);
const cxRuns = () => load(CX, ".jsonl", parseCodex);
const rnRuns = () => load(RUNS, ".json", parseRunRecord);

const ALLOWED = [
  /^Q1 which skill fails most often: (yes|no)$/,
  /^Q2 what each scheduled run costs: (yes|no)$/,
  /^Q3 which claims lack evidence: (yes|no)$/,
  /^three questions answered: (yes|no)$/,
  /^unanswered: (none|Q[123](, Q[123])*)$/,
  /^stop rule P1: (tripped|not tripped)$/,
  /^.*Has it changed a decision about Clark\?.*$/,
];

describe("HL-020 A1 stdout carries only yes/no, the summary, the unanswered list, the trip line and the reminder", () => {
  it("A1: every non-blank stdout line is one of the allowed shapes; all of them are present", async () => {
    const cwd = gitCwd();
    const r = await run(args(FULL, "2026-11-09"), cwd);
    expect(r.code).toBe(0);
    const lines = r.out.split("\n").filter((l) => l.trim() !== "");
    for (const l of lines) expect(ALLOWED.some((re) => re.test(l)), `unexpected stdout line: ${l}`).toBe(true);
    for (const re of ALLOWED) expect(lines.filter((l) => re.test(l)).length, String(re)).toBeGreaterThanOrEqual(1);
    expect(lines.filter((l) => /Has it changed a decision about Clark\?/.test(l))).toHaveLength(1);
    expect(lines).toHaveLength(7);
  });

  it("A1: nothing from the logs leaks on stdout or stderr (needles drawn from the fixtures at test time)", async () => {
    const cwd = gitCwd();
    const all = [...ccRuns(), ...cxRuns(), ...rnRuns()];
    const base = (await run(args(FULL, "2026-11-09"), cwd));
    const allowedText = "q1 which skill fails most often: yes no three questions answered unanswered none stop rule p1 tripped not tripped has it changed a decision about clark?";
    const needles = new Set<string>();
    for (const r of all) {
      if (r.id) needles.add(r.id);
      for (const c of r.claims) if (c.text.length >= 8) needles.add(c.text);
      for (const t of r.toolCalls) if (typeof t.skill === "string" && t.skill.length >= 4) needles.add(t.skill);
      if (r.team?.taskId) needles.add(r.team.taskId);
      if (r.team?.branch) needles.add(r.team.branch);
    }
    const usable = [...needles].filter((n) => !allowedText.includes(n.toLowerCase()));
    expect(usable.length).toBeGreaterThan(20);
    expect(all.some((r) => r.toolCalls.some((t) => typeof t.skill === "string" && usable.includes(t.skill)))).toBe(true);
    for (const text of [base.out, base.err]) {
      for (const n of usable) expect(text, `leaks ${n.slice(0, 12)}...`).not.toContain(n);
      for (const frag of ["person-", "email-", "home-", "addr-", "$", "/Users", "fixtures/", "runs/", cwd, CC, CX, RUNS, keyFile, keyText, tmp])
        expect(text, `leaks ${frag}`).not.toContain(frag);
      expect(text).not.toMatch(/\d{2,}/); // no counts, costs or ids; only the single digits in Q1..Q3 and P1
    }
    expect(base.code).toBe(0);
  });

  it("A1: the same holds when the check refuses (no log data on stdout or stderr)", async () => {
    const cwd = gitCwd("/other/\n");
    const r = await run(args(FULL, "2026-11-09"), cwd);
    const id = ccRuns()[0].id!;
    expect(r.out + r.err).not.toContain(id);
    expect(r.out + r.err).not.toContain(keyText);
  });
});

describe("HL-020 A2 'answered' comes from answerP1Questions", () => {
  it("A2: all three sources -> every question yes, 'three questions answered: yes', 'unanswered: none'", async () => {
    const exp = expected([...ccRuns(), ...cxRuns(), ...rnRuns()]);
    expect(exp).toEqual(["yes", "yes", "yes"]); // precondition from the library, not the CLI
    const r = await run(args(FULL, "2026-11-09"), gitCwd());
    expect(r.code).toBe(0);
    expect(r.out).toContain("Q1 which skill fails most often: yes");
    expect(r.out).toContain("Q2 what each scheduled run costs: yes");
    expect(r.out).toContain("Q3 which claims lack evidence: yes");
    expect(r.out).toContain("three questions answered: yes");
    expect(r.out).toContain("unanswered: none");
  });

  it("A2: codex only -> mixed answers match the library, summary 'no', unanswered lists exactly the 'no' questions", async () => {
    const exp = expected(cxRuns());
    expect(exp.includes("no") && exp.includes("yes")).toBe(true);
    const r = await run(args(["--codex", CX], "2026-11-09"), gitCwd());
    expect(r.code).toBe(0);
    expect(r.out).toContain(`Q1 which skill fails most often: ${exp[0]}`);
    expect(r.out).toContain(`Q2 what each scheduled run costs: ${exp[1]}`);
    expect(r.out).toContain(`Q3 which claims lack evidence: ${exp[2]}`);
    expect(r.out).toContain("three questions answered: no");
    const un = exp.flatMap((v, i) => (v === "no" ? [`Q${i + 1}`] : [])).join(", ");
    expect(r.out).toContain(`unanswered: ${un}`);
  });

  it("A2: team runs only (no tool calls, no claims) -> Q2 yes, Q1 and Q3 no", async () => {
    const r = await run(args(["--runs", RUNS], "2026-11-09"), gitCwd());
    expect(r.code).toBe(0);
    expect(r.out).toContain("Q1 which skill fails most often: no");
    expect(r.out).toContain("Q2 what each scheduled run costs: yes");
    expect(r.out).toContain("Q3 which claims lack evidence: no");
    expect(r.out).toContain("unanswered: Q1, Q3");
  });

  it("A2: Q1 'no-failures' counts as answered (skill calls exist, none failed)", async () => {
    const dir = mkdtempSync(join(tmp, "nf-"));
    let picked: string | null = null;
    for (const f of files(CC, ".jsonl")) {
      const run0 = parseClaudeCode(readFileSync(join(CC, f), "utf8"));
      if (answerP1Questions([run0]).skillFailures.status === "no-failures") {
        picked = f;
        break;
      }
    }
    expect(picked, "a fixture file whose Q1 status is no-failures").not.toBeNull();
    cpSync(join(CC, picked!), join(dir, picked!));
    const r = await run(args(["--claude-code", dir], "2026-11-09"), gitCwd());
    expect(r.code).toBe(0);
    expect(r.out).toContain("Q1 which skill fails most often: yes");
    expect(r.out).toContain("Q2 what each scheduled run costs: no");
  });

  it("A2/A6: a source dir with no usable files -> every question no, summary no", async () => {
    const empty = mkdtempSync(join(tmp, "empty-"));
    const r = await run(args(["--runs", empty], "2026-11-09"), gitCwd());
    expect(r.code).toBe(0);
    expect(r.out).toContain("Q1 which skill fails most often: no");
    expect(r.out).toContain("Q2 what each scheduled run costs: no");
    expect(r.out).toContain("Q3 which claims lack evidence: no");
    expect(r.out).toContain("three questions answered: no");
    expect(r.out).toContain("unanswered: Q1, Q2, Q3");
  });
});

describe("HL-020 A3 the full report only goes under a gitignored local path", () => {
  it("A3: a report .json appears under local/stop-check/, parses, holds details the stdout does not", async () => {
    const cwd = gitCwd();
    const r = await run(args(FULL, "2026-11-09"), cwd);
    expect(r.code).toBe(0);
    const reps = reports(cwd);
    expect(reps.length).toBe(1);
    const text = readFileSync(join(dirOf(cwd), reps[0]), "utf8");
    expect(() => JSON.parse(text)).not.toThrow();
    const topSkill = answerP1Questions([...ccRuns(), ...cxRuns(), ...rnRuns()]).skillFailures.top[0].skill;
    expect(text).toContain(topSkill);
    expect(r.out).not.toContain(topSkill);
    // git agrees the report is ignored and nothing is left to commit
    expect(execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim()).toBe("?? .gitignore");
    expect(execFileSync("git", ["check-ignore", "-q", "local/stop-check/history.jsonl"], { cwd }).toString()).toBe("");
  });

  it("A3: cwd is a git repo whose .gitignore does not ignore local/ -> refuses, writes nothing", async () => {
    for (const ig of ["/other/\n", null]) {
      const cwd = gitCwd(ig);
      const r = await run(args(FULL, "2026-11-09"), cwd);
      expect(r.code).not.toBe(0);
      expect(r.err.trim().length).toBeGreaterThan(0);
      expect(existsSync(join(cwd, "local"))).toBe(false);
      expect(readdirSync(cwd).filter((f) => f !== ".git" && f !== ".gitignore")).toEqual([]);
    }
  });

  it("A3: a tracked history file is never appended to", async () => {
    const cwd = gitCwd();
    seed(cwd, [["2026-11-07", "no", "yes", "no"]]);
    execFileSync("git", ["add", "-f", "local/stop-check/history.jsonl"], { cwd });
    const before = readFileSync(join(dirOf(cwd), "history.jsonl"), "utf8");
    const r = await run(args(FULL, "2026-11-09"), cwd);
    expect(r.code).not.toBe(0);
    expect(readFileSync(join(dirOf(cwd), "history.jsonl"), "utf8")).toBe(before);
    expect(reports(cwd)).toEqual([]);
  });

  it("A3: nothing is written inside the source directories or next to the key", async () => {
    const root = mkdtempSync(join(tmp, "ro-"));
    cpSync(CX, join(root, "cx"), { recursive: true });
    const before = readdirSync(root, { recursive: true }).sort();
    const keyDirBefore = readdirSync(tmp).sort();
    const r = await run(args(["--codex", join(root, "cx")], "2026-11-09"), gitCwd());
    expect(r.code).toBe(0);
    expect(readdirSync(root, { recursive: true }).sort()).toEqual(before);
    expect(readdirSync(tmp).filter((f) => !f.startsWith("cwd-"))).toEqual(keyDirBefore.filter((f) => !f.startsWith("cwd-")));
  });
});

describe("HL-020 A4 history and the trip condition", () => {
  it("A4: each check appends exactly one history line {date,q1,q2,q3}", async () => {
    const cwd = gitCwd();
    const exp = expected(cxRuns());
    expect((await run(args(["--codex", CX], "2026-11-08"), cwd)).code).toBe(0);
    expect(historyOf(cwd)).toHaveLength(1);
    expect(JSON.parse(historyOf(cwd)[0])).toEqual({ date: "2026-11-08", q1: exp[0], q2: exp[1], q3: exp[2] });
    expect((await run(args(FULL, "2026-11-09"), cwd)).code).toBe(0);
    const h = historyOf(cwd).map((l) => JSON.parse(l));
    expect(h).toHaveLength(2);
    expect(h[0]).toEqual({ date: "2026-11-08", q1: exp[0], q2: exp[1], q3: exp[2] });
    expect(h[1]).toEqual({ date: "2026-11-09", q1: "yes", q2: "yes", q3: "yes" });
  });

  const un = ["--codex", CX]; // leaves Q1 and Q2 unanswered
  const trip = async (rows: Array<[string, "yes" | "no", "yes" | "no", "yes" | "no"]>, srcs: string[], now: string) => {
    const cwd = gitCwd();
    if (rows.length) seed(cwd, rows);
    const r = await run(args(srcs, now), cwd);
    expect(r.code).toBe(0);
    return r.out;
  };

  it("A4: third consecutive unanswered check after 2026-11-06 -> tripped", async () => {
    const out = await trip([["2026-11-07", "no", "no", "yes"], ["2026-11-08", "no", "yes", "no"]], un, "2026-11-09");
    expect(out).toContain("stop rule P1: tripped");
    expect(out).not.toContain("not tripped");
  });

  it("A4: an all-answered check in between -> not tripped", async () => {
    const out = await trip([["2026-11-07", "no", "no", "no"], ["2026-11-08", "yes", "yes", "yes"]], un, "2026-11-09");
    expect(out).toContain("stop rule P1: not tripped");
  });

  it("A4: the current check answering everything -> not tripped, even after two unanswered", async () => {
    const out = await trip([["2026-11-07", "no", "no", "no"], ["2026-11-08", "no", "no", "no"]], FULL, "2026-11-09");
    expect(out).toContain("stop rule P1: not tripped");
  });

  it("A4: only two checks in total -> not tripped; no history at all -> not tripped", async () => {
    expect(await trip([["2026-11-08", "no", "no", "no"]], un, "2026-11-09")).toContain("stop rule P1: not tripped");
    expect(await trip([], un, "2026-11-09")).toContain("stop rule P1: not tripped");
  });

  it("A4: prior checks dated on or before 2026-11-06 do not count -> not tripped", async () => {
    const out = await trip([["2026-11-05", "no", "no", "no"], ["2026-11-06", "no", "no", "no"]], un, "2026-11-09");
    expect(out).toContain("stop rule P1: not tripped");
  });

  it("A4: boundary: the last three are 11-07, 11-08, 11-09 (older entries on 11-06 ignored) -> tripped; 11-06, 11-07, 11-08 -> not tripped", async () => {
    const t = await trip([["2026-11-06", "no", "no", "no"], ["2026-11-07", "no", "no", "no"], ["2026-11-08", "no", "no", "no"]], un, "2026-11-09");
    expect(t).toContain("stop rule P1: tripped");
    const n = await trip([["2026-11-05", "no", "no", "no"], ["2026-11-06", "no", "no", "no"], ["2026-11-07", "no", "no", "no"]], un, "2026-11-08");
    expect(n).toContain("stop rule P1: not tripped");
  });

  it("A4: stays tripped on a fourth consecutive unanswered check", async () => {
    const out = await trip(
      [["2026-11-07", "no", "no", "no"], ["2026-11-08", "no", "no", "no"], ["2026-11-09", "no", "no", "no"]], un, "2026-11-10",
    );
    expect(out).toContain("stop rule P1: tripped");
  });

  it("A4: the reminder line is printed and no answer is recorded in the history or report", async () => {
    const cwd = gitCwd();
    const r = await run(args(FULL, "2026-11-09"), cwd);
    expect(r.out).toContain("Has it changed a decision about Clark?");
    expect(Object.keys(JSON.parse(historyOf(cwd)[0])).sort()).toEqual(["date", "q1", "q2", "q3"]);
  });
});

describe("HL-020 A5 exit codes and key rules", () => {
  const nothing = (cwd: string, r: Cap) => {
    expect(r.code).toBe(2);
    expect(r.err.trim().length).toBeGreaterThan(0);
    expect(r.out).not.toMatch(/^Q[123] /m);
    expect(existsSync(join(cwd, "local"))).toBe(false);
  };

  it("A5: exit 0 even when questions are unanswered", async () => {
    const r = await run(args(["--codex", CX], "2026-11-09"), gitCwd());
    expect(r.out).toContain("three questions answered: no");
    expect(r.code).toBe(0);
  });

  it("A5: no key file -> exit 2, nothing written", async () => {
    const cwd = gitCwd();
    nothing(cwd, await run(["--stop-check", ...FULL, "--now", "2026-11-09"], cwd));
  });

  it("A5: key from HL_PSEUDONYM_KEY_FILE works", async () => {
    const cwd = gitCwd();
    const r = await run(["--stop-check", ...FULL, "--now", "2026-11-09"], cwd, { HL_PSEUDONYM_KEY_FILE: keyFile });
    expect(r.code).toBe(0);
    expect(r.out + r.err).not.toContain(keyText);
  });

  it("A5: missing or empty key file -> exit 2", async () => {
    const cwd = gitCwd();
    nothing(cwd, await run(["--stop-check", ...FULL, "--key-file", join(tmp, "nope.txt"), "--now", "2026-11-09"], cwd));
    const empty = join(tmp, "empty.txt");
    writeFileSync(empty, "");
    nothing(cwd, await run(["--stop-check", ...FULL, "--key-file", empty, "--now", "2026-11-09"], cwd));
  });

  it("A5: a key file inside a git working tree (the cwd itself) -> exit 2, key never printed", async () => {
    const cwd = gitCwd();
    const kf = join(cwd, "key.txt");
    writeFileSync(kf, keyText);
    const r = await run(["--stop-check", ...FULL, "--key-file", kf, "--now", "2026-11-09"], cwd);
    nothing(cwd, r);
    expect(r.out + r.err).not.toContain(keyText);
  });

  it("A5: no source dir, unknown flag, output-file option, bad or valueless --now -> exit 2, nothing written", async () => {
    const bad: string[][] = [
      ["--stop-check", "--key-file", keyFile, "--now", "2026-11-09"],
      [...args(FULL, "2026-11-09"), "--bogus"],
      [...args(FULL, "2026-11-09"), "--out", join(tmp, "o.txt")],
      ["--stop-check", ...FULL, "--key-file", keyFile, "--now", "not-a-date"],
      ["--stop-check", ...FULL, "--key-file", keyFile, "--now"],
    ];
    for (const a of bad) {
      const cwd = gitCwd();
      nothing(cwd, await run(a, cwd));
    }
    expect(existsSync(join(tmp, "o.txt"))).toBe(false);
  });

  it("A5: a missing source dir -> exit 2", async () => {
    const cwd = gitCwd();
    nothing(cwd, await run(args(["--codex", join(tmp, "missing")], "2026-11-09"), cwd));
  });
});

describe("HL-020 A7 the suite leaves the repo tree untouched", () => {
  it("A7: git status --porcelain of the repo is identical to its value before the suite", () => {
    expect(porcelain()).toBe(statusBefore);
  });
});
