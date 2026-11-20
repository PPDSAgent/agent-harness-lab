// @vitest-environment node
// FROZEN acceptance tests for HL-017 (local ingest CLI; criteria A1, A2, A3, A4, A5, A6, A7, A8).
// Written by the test engineer before the build; the builder may not edit this file.
// All planted values are SYNTHETIC made-up tokens. The test key is generated at test time
// in a temp dir outside the repo.
//
// PUBLIC CONTRACT (src/cli/ingest.ts):
//   main(argv: string[], io: { stdout, stderr, env?, cwd? }): Promise<number>   // exit code
//   io.stdout / io.stderr are objects with write(chunk: string): unknown (captured here).
//   Flags: --claude-code <dir> --codex <dir> --runs <dir> --key-file <path> --names-file <path>
//   Output assumptions the tests rely on (from the task block):
//     - each run prints on exactly one line that contains the run id;
//     - per-source totals are lines naming the source and containing "total" and the count;
//     - a skipped (malformed) file is reported as "skipped" with its count.
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseClaudeCode, parseCodex, parseRunRecord } from "../src/lib/ingest";
import { main } from "../src/cli/ingest";
import { pseudonym } from "../src/lib/pseudonymise";

const REPO = resolve(__dirname, "..");
const CC = join(REPO, "fixtures/claude-code");
const CX = join(REPO, "fixtures/codex");
const RUNS = join(REPO, "runs");

const files = (dir: string, ext: string) => readdirSync(dir).filter((f) => f.endsWith(ext)).sort();

type Cap = { code: number; out: string; err: string };
async function run(argv: string[], env: Record<string, string> = {}): Promise<Cap> {
  let out = "";
  let err = "";
  const io = {
    stdout: { write: (c: string | Uint8Array) => ((out += String(c)), true) },
    stderr: { write: (c: string | Uint8Array) => ((err += String(c)), true) },
    env,
    cwd: REPO,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = await main(argv, io as any);
  return { code, out, err };
}

let tmp: string;
let keyFile: string;
let keyText: string;
let keyFile2: string;
let keyText2: string;
let namesFile: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "hl017-"));
  keyText = randomBytes(24).toString("hex");
  keyText2 = randomBytes(24).toString("hex");
  keyFile = join(tmp, "key1.txt");
  keyFile2 = join(tmp, "key2.txt");
  writeFileSync(keyFile, keyText); // no trailing newline
  writeFileSync(keyFile2, keyText2);
  namesFile = join(tmp, "names.txt");
  writeFileSync(namesFile, "zorblax quinterro\n"); // lower case on purpose: matching is case-insensitive
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const base = () => ["--claude-code", CC, "--codex", CX, "--runs", RUNS, "--key-file", keyFile];

describe("HL-017 A1 privacy notice first", () => {
  it("A1: notice precedes the first data line and says local, writes no files, pseudonymised, key path (never the key)", async () => {
    const r = await run(base());
    expect(r.code).toBe(0);
    const firstId = parseClaudeCode(readFileSync(join(CC, files(CC, ".jsonl")[0]), "utf8")).id!;
    const at = r.out.indexOf(firstId);
    expect(at).toBeGreaterThan(0);
    const before = r.out.slice(0, at);
    expect(before).toMatch(/local/i);
    expect(before).toMatch(/no files|not write|writes nothing|does not write|never writes/i);
    expect(before).toMatch(/pseudonym/i);
    expect(before).toContain(keyFile);
    expect(r.out).not.toContain(keyText);
    expect(r.err).not.toContain(keyText);
  });

  it("A1: the notice is the first thing on stdout (no data line before it)", async () => {
    const r = await run(base());
    const lines = r.out.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBeGreaterThan(3);
    expect(lines[0]).toMatch(/local|privacy|pseudonym/i);
  });
});

describe("HL-017 A2 reads all three sources", () => {
  it("A2: committed fixtures give totals equal to files parsed, zero dropped, one line per run", async () => {
    const r = await run(base());
    expect(r.code).toBe(0);
    const lines = r.out.split("\n");
    const expected: Array<[string, RegExp, number]> = [
      ["claude-code", /claude/i, files(CC, ".jsonl").length],
      ["codex", /codex/i, files(CX, ".jsonl").length],
      ["runs", /runs|team/i, files(RUNS, ".json").length],
    ];
    for (const [name, re, n] of expected) {
      const hit = lines.some((l) => re.test(l) && /total/i.test(l) && new RegExp(`\\b${n}\\b`).test(l));
      expect(hit, `a totals line for ${name} with ${n}`).toBe(true);
    }
    expect(r.out).toMatch(/dropped\D{0,4}0\b|\b0\s+dropped/i);
    expect(r.out).not.toMatch(/dropped\D{0,4}[1-9]/i);
    // one line per run: every run id appears on exactly one line
    const ids = [
      ...files(CC, ".jsonl").map((f) => parseClaudeCode(readFileSync(join(CC, f), "utf8")).id),
      ...files(CX, ".jsonl").map((f) => parseCodex(readFileSync(join(CX, f), "utf8")).id),
      ...files(RUNS, ".json").map((f) => parseRunRecord(readFileSync(join(RUNS, f), "utf8")).id),
    ];
    expect(ids.length).toBe(60 + 30 + files(RUNS, ".json").length);
    for (const id of ids) {
      const n = lines.filter((l) => l.includes(id!)).length;
      expect(n, `run ${id} printed on exactly one line`).toBe(1);
    }
  });

  it("A2: any subset of sources works (only --codex)", async () => {
    const r = await run(["--codex", CX, "--key-file", keyFile]);
    expect(r.code).toBe(0);
    const id = parseCodex(readFileSync(join(CX, files(CX, ".jsonl")[0]), "utf8")).id!;
    expect(r.out).toContain(id);
    const ccId = parseClaudeCode(readFileSync(join(CC, files(CC, ".jsonl")[0]), "utf8")).id!;
    expect(r.out).not.toContain(ccId);
  });

  it("A2: only --runs works", async () => {
    const r = await run(["--runs", RUNS, "--key-file", keyFile]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(parseRunRecord(readFileSync(join(RUNS, files(RUNS, ".json")[0]), "utf8")).id!);
  });
});

// ---- planted inputs (A3, A4) -------------------------------------------------------------
const ADDR = ["123", "Fakeloop", "Avenue"].join(" "); // built at test time
const PLANT = `user-01@example.test /Users/synthetic-07/proj ${ADDR} Zorblax Quinterro C:\\Users\\synthetic-08\\x /home/synthetic-09/y`;
const RAW = [
  "user-01@example.test", "synthetic-07", "Fakeloop", "Zorblax", "Quinterro", "synthetic-08", "synthetic-09",
];

function plantedDirs(root: string) {
  const cc = join(root, "cc"), cx = join(root, "cx"), rn = join(root, "runs");
  for (const d of [cc, cx, rn]) mkdirSync(d, { recursive: true });
  const ccFile = files(CC, ".jsonl")[0];
  const lines = readFileSync(join(CC, ccFile), "utf8").trimEnd().split("\n").map((l, i) => {
    if (i === 0) return l;
    const o = JSON.parse(l);
    o.sessionId = `sess ${PLANT}`;
    o.cwd = "/Users/synthetic-07/proj";
    return JSON.stringify(o);
  });
  writeFileSync(join(cc, ccFile), lines.join("\n") + "\n");
  const cxFile = files(CX, ".jsonl")[0];
  const cxLines = readFileSync(join(CX, cxFile), "utf8").trimEnd().split("\n").map((l) => {
    const o = JSON.parse(l);
    if (o.type === "session_meta") { o.payload.id = `sess ${PLANT}`; o.payload.session_id = o.payload.id; }
    return JSON.stringify(o);
  });
  writeFileSync(join(cx, cxFile), cxLines.join("\n") + "\n");
  const rn0 = files(RUNS, ".json")[0];
  const rec = JSON.parse(readFileSync(join(RUNS, rn0), "utf8"));
  rec.slot = `sess ${PLANT}`;
  rec.branch = `run/${PLANT}`;
  writeFileSync(join(rn, rn0), JSON.stringify(rec, null, 2));
  return { cc, cx, rn };
}
const plantedArgs = (d: { cc: string; cx: string; rn: string }, kf: string) => [
  "--claude-code", d.cc, "--codex", d.cx, "--runs", d.rn, "--key-file", kf, "--names-file", namesFile,
];
const tokens = (s: string) => [...new Set(s.match(/\b(?:email|home|addr|person)-[0-9a-f]{4,}/g) ?? [])].sort();

describe("HL-017 A3 pseudonymises before display", () => {
  it("A3: planted email, home paths, address and name never appear raw in stdout or stderr", async () => {
    const d = plantedDirs(mkdtempSync(join(tmp, "p-")));
    const r = await run(plantedArgs(d, keyFile));
    expect(r.code).toBe(0);
    for (const raw of RAW) {
      expect(r.out, `stdout leaks ${raw}`).not.toContain(raw);
      expect(r.err, `stderr leaks ${raw}`).not.toContain(raw);
      expect(r.out.toLowerCase()).not.toContain(raw.toLowerCase());
    }
    const t = tokens(r.out);
    for (const kind of ["email", "home", "addr", "person"]) {
      expect(t.some((x) => x.startsWith(kind + "-")), `a ${kind}- pseudonym is printed`).toBe(true);
    }
  });

  it("A3: pseudonyms are HMAC-SHA256(key, normalised value) with the key file's bytes", async () => {
    const d = plantedDirs(mkdtempSync(join(tmp, "p-")));
    const r = await run(plantedArgs(d, keyFile));
    expect(r.out).toContain(pseudonym("email", "user-01@example.test", keyText));
    expect(r.out).toContain(pseudonym("person", "zorblax quinterro", keyText));
    const hex = pseudonym("email", "user-01@example.test", keyText).slice("email-".length);
    expect(createHmac("sha256", keyText).update("user-01@example.test").digest("hex").startsWith(hex)).toBe(true);
  });

  it("A3: names are matched case-insensitively against the names file", async () => {
    const d = plantedDirs(mkdtempSync(join(tmp, "p-")));
    const r = await run(plantedArgs(d, keyFile)); // names file is lower case; planted is Title Case
    expect(r.out.toLowerCase()).not.toContain("quinterro");
  });

  it("A3: without a names file, emails/paths/addresses are still pseudonymised", async () => {
    const d = plantedDirs(mkdtempSync(join(tmp, "p-")));
    const r = await run(["--claude-code", d.cc, "--codex", d.cx, "--runs", d.rn, "--key-file", keyFile]);
    expect(r.code).toBe(0);
    for (const raw of ["user-01@example.test", "synthetic-07", "Fakeloop"]) expect(r.out).not.toContain(raw);
  });
});

describe("HL-017 A4 stable and keyed", () => {
  it("A4: same key, two runs -> same pseudonyms; different key -> different pseudonyms", async () => {
    const d = plantedDirs(mkdtempSync(join(tmp, "p-")));
    const a = tokens((await run(plantedArgs(d, keyFile))).out);
    const b = tokens((await run(plantedArgs(d, keyFile))).out);
    const c = tokens((await run(plantedArgs(d, keyFile2))).out);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(c.length).toBeGreaterThan(0);
    expect(c.filter((x) => a.includes(x))).toEqual([]);
  });

  it("A4: the same value in different fields/sources gets one pseudonym", async () => {
    const d = plantedDirs(mkdtempSync(join(tmp, "p-")));
    const r = await run(plantedArgs(d, keyFile));
    const em = pseudonym("email", "user-01@example.test", keyText);
    // planted in the claude-code id, the codex id and the runs id/branch: at least 3 lines carry it
    expect(r.out.split("\n").filter((l) => l.includes(em)).length).toBeGreaterThanOrEqual(3);
  });
});

describe("HL-017 A5 key handling", () => {
  const noData = async (argv: string[], env: Record<string, string> = {}) => {
    const r = await run(argv, env);
    expect(r.code).toBe(2);
    expect(r.err.trim().length).toBeGreaterThan(0);
    const id = parseClaudeCode(readFileSync(join(CC, files(CC, ".jsonl")[0]), "utf8")).id!;
    expect(r.out).not.toContain(id);
    return r;
  };

  it("A5: missing key file path -> exit 2, usage error, no data", async () => {
    await noData(["--claude-code", CC, "--key-file", join(tmp, "does-not-exist.txt")]);
  });

  it("A5: empty key file -> exit 2, no data", async () => {
    const empty = join(tmp, "empty.txt");
    writeFileSync(empty, "");
    await noData(["--claude-code", CC, "--key-file", empty]);
  });

  it("A5: no key flag and no env -> exit 2, no data", async () => {
    await noData(["--claude-code", CC]);
  });

  it("A5: key from env HL_PSEUDONYM_KEY_FILE works", async () => {
    const r = await run(["--codex", CX], { HL_PSEUDONYM_KEY_FILE: keyFile });
    expect(r.code).toBe(0);
    expect(r.out).toContain(keyFile);
    expect(r.out).not.toContain(keyText);
  });

  it("A5: a key file inside this repo's git working tree is refused with exit 2", async () => {
    const inside = mkdtempSync(join(REPO, ".hl017-key-"));
    try {
      const kf = join(inside, "key.txt");
      writeFileSync(kf, keyText);
      const r = await noData(["--claude-code", CC, "--key-file", kf]);
      expect(r.err + r.out).not.toContain(keyText);
    } finally {
      rmSync(inside, { recursive: true, force: true });
    }
  });

  it("A5: key bytes never appear in stdout or stderr on a success or a failure", async () => {
    const ok = await run(base());
    expect(ok.out + ok.err).not.toContain(keyText);
    const bad = await run(["--claude-code", join(tmp, "nope"), "--key-file", keyFile]);
    expect(bad.out + bad.err).not.toContain(keyText);
  });
});

describe("HL-017 A6 writes nothing", () => {
  const snapshot = (dir: string): string[] =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const p = join(e.parentPath, e.name);
        return `${p}:${statSync(p).size}:${statSync(p).mtimeMs}`;
      })
      .sort();

  it("A6: git status --porcelain is unchanged by a full run over the fixtures", async () => {
    const status = () => execFileSync("git", ["status", "--porcelain"], { cwd: REPO, encoding: "utf8" });
    const before = status();
    const r = await run(base());
    expect(r.code).toBe(0);
    expect(status()).toBe(before);
  });

  it("A6: copies of the inputs keep the same files and mtimes", async () => {
    const root = mkdtempSync(join(tmp, "w-"));
    cpSync(CC, join(root, "cc"), { recursive: true, preserveTimestamps: true });
    cpSync(CX, join(root, "cx"), { recursive: true, preserveTimestamps: true });
    cpSync(RUNS, join(root, "runs"), { recursive: true, preserveTimestamps: true });
    const keyDir = dirname(keyFile);
    const before = [snapshot(root), snapshot(keyDir)];
    const r = await run(["--claude-code", join(root, "cc"), "--codex", join(root, "cx"), "--runs", join(root, "runs"), "--key-file", keyFile]);
    expect(r.code).toBe(0);
    expect([snapshot(root), snapshot(keyDir)]).toEqual(before);
  });

  it("A6: there is no output-file option", async () => {
    for (const flag of ["--out", "--output", "-o", "--write", "--out-file"]) {
      const target = join(tmp, `out-${flag.replace(/-/g, "")}.txt`);
      const r = await run([...base(), flag, target]);
      expect(r.code, `${flag} is rejected`).toBe(2);
      expect(existsSync(target), `${flag} created a file`).toBe(false);
    }
  });
});

describe("HL-017 A7 not in the app bundle", () => {
  it("A7: the CLI and the pseudonymise library exist", () => {
    expect(existsSync(join(REPO, "src/cli/ingest.ts"))).toBe(true);
    expect(existsSync(join(REPO, "src/lib/pseudonymise.ts"))).toBe(true);
  });

  it("A7: nothing reachable from src/main.tsx imports src/cli/ or src/lib/pseudonymise", () => {
    const exts = ["", ".ts", ".tsx", "/index.ts", "/index.tsx", ".css"];
    const seen = new Set<string>();
    const stack = [join(REPO, "src/main.tsx")];
    const bad: string[] = [];
    const re = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      if (!/\.(tsx?|jsx?)$/.test(f)) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(re)) {
        const spec = m[1];
        if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("@/")) continue;
        const raw = spec.startsWith("@/") ? join(REPO, "src", spec.slice(2)) : resolve(dirname(f), spec);
        const hit = exts.map((e) => raw + e).find((p) => existsSync(p) && statSync(p).isFile());
        if (!hit) continue;
        if (/\/src\/cli\//.test(hit) || /\/src\/lib\/pseudonymise(\.ts|\/)/.test(hit)) bad.push(`${f} -> ${hit}`);
        stack.push(hit);
      }
    }
    expect(seen.size, "the scan walked the real import graph").toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });
});

describe("HL-017 A8 bad usage and malformed input", () => {
  it("A8: no source dir -> exit 2 with a message on stderr", async () => {
    const r = await run(["--key-file", keyFile]);
    expect(r.code).toBe(2);
    expect(r.err.trim().length).toBeGreaterThan(0);
  });

  it("A8: unknown flag -> exit 2 with a message on stderr", async () => {
    const r = await run([...base(), "--frobnicate"]);
    expect(r.code).toBe(2);
    expect(r.err.trim().length).toBeGreaterThan(0);
  });

  it("A8: unreadable (missing) dir -> exit 2 with a message on stderr", async () => {
    const r = await run(["--codex", join(tmp, "no-such-dir"), "--key-file", keyFile]);
    expect(r.code).toBe(2);
    expect(r.err.trim().length).toBeGreaterThan(0);
  });

  it("A8: a path that is a file, not a dir -> exit 2", async () => {
    const r = await run(["--codex", keyFile, "--key-file", keyFile]);
    expect(r.code).toBe(2);
  });

  it.each([
    ["claude-code", "--claude-code", CC, ".jsonl"],
    ["codex", "--codex", CX, ".jsonl"],
    ["runs", "--runs", RUNS, ".json"],
  ])("A8: a malformed %s file is counted as skipped and never crashes", async (_n, flag, src, ext) => {
    const dir = mkdtempSync(join(tmp, "m-"));
    const good = files(src, ext)[0];
    cpSync(join(src, good), join(dir, good));
    writeFileSync(join(dir, `broken${ext}`), "{{{ this is not json\n\u0000\u0001 garbage");
    const r = await run([flag, dir, "--key-file", keyFile]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/skipped\D{0,4}1\b|\b1\s+skipped/i);
    expect(r.out).toContain(parseGoodId(src, good));
  });
});

function parseGoodId(src: string, f: string): string {
  const t = readFileSync(join(src, f), "utf8");
  if (src === CC) return parseClaudeCode(t).id!;
  if (src === CX) return parseCodex(t).id!;
  return parseRunRecord(t).id!;
}
