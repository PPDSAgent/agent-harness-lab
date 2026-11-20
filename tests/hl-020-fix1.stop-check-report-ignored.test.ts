// @vitest-environment node
// FROZEN fix tests for HL-020 fix 1 (reviews/2026-11-13T0039-HL-020-r1.md, required fix 1).
// Written by the test engineer before the fix; the builder may not edit this file.
// All data is SYNTHETIC: the committed fixtures plus temp dirs created (and removed) at test time.
//
// CONTRACT (extends tests/hl-020.stop-check.test.ts, which stays frozen):
//   `ingest --stop-check` must confirm with `git check-ignore -q` that BOTH local/stop-check/history.jsonl
//   AND the per-check report path (local/stop-check/<name>.json) are ignored. If either is not, it exits
//   non-zero, writes nothing, and `git status --porcelain -uall` shows only the untracked .gitignore.
//   Positive control: with `/local/` ignored the check still exits 0 and writes the report.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main } from "../src/cli/ingest";

const REPO = resolve(__dirname, "..");
const CX = join(REPO, "fixtures/codex");

type Cap = { code: number; out: string; err: string };
async function run(argv: string[], cwd: string): Promise<Cap> {
  let out = "";
  let err = "";
  const io = {
    stdout: { write: (c: string | Uint8Array) => ((out += String(c)), true) },
    stderr: { write: (c: string | Uint8Array) => ((err += String(c)), true) },
    env: {},
    cwd,
  };
  const code = await main(argv, io as any);
  return { code, out, err };
}

const porcelain = (cwd: string) => execFileSync("git", ["status", "--porcelain", "-uall"], { cwd, encoding: "utf8" });

let tmp: string;
let keyFile: string;
let repoStatusBefore: string;
beforeAll(() => {
  repoStatusBefore = porcelain(REPO);
  tmp = mkdtempSync(join(tmpdir(), "hl020fix1-"));
  keyFile = join(tmp, "key.txt");
  writeFileSync(keyFile, randomBytes(24).toString("hex"));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function gitCwd(ignore: string): string {
  const d = mkdtempSync(join(tmp, "cwd-"));
  execFileSync("git", ["init", "-q"], { cwd: d });
  writeFileSync(join(d, ".gitignore"), ignore);
  return d;
}
const args = () => ["--stop-check", "--codex", CX, "--key-file", keyFile, "--now", "2026-11-10"];

describe("HL-020 fix1: the report path must be ignored as well as the history file", () => {
  it("fix1 (a): .gitignore ignores only history.jsonl -> refuses, writes nothing, status shows only .gitignore", async () => {
    const cwd = gitCwd("local/stop-check/history.jsonl\n");
    const r = await run(args(), cwd);
    expect(r.code).not.toBe(0);
    expect(r.err.trim().length).toBeGreaterThan(0);
    expect(existsSync(join(cwd, "local"))).toBe(false);
    expect(porcelain(cwd).trim()).toBe("?? .gitignore");
  });

  it("fix1 (b): .gitignore ignores local/stop-check/* but re-includes *.json -> refuses, writes nothing, status shows only .gitignore", async () => {
    const cwd = gitCwd("local/stop-check/*\n!local/stop-check/*.json\n");
    const r = await run(args(), cwd);
    expect(r.code).not.toBe(0);
    expect(r.err.trim().length).toBeGreaterThan(0);
    expect(existsSync(join(cwd, "local"))).toBe(false);
    expect(porcelain(cwd).trim()).toBe("?? .gitignore");
  });

  it("fix1 positive control: .gitignore = /local/ -> exit 0, one report written, status shows only .gitignore", async () => {
    const cwd = gitCwd("/local/\n");
    const r = await run(args(), cwd);
    expect(r.code).toBe(0);
    const reps = readdirSync(join(cwd, "local/stop-check")).filter((f) => f.endsWith(".json"));
    expect(reps).toHaveLength(1);
    expect(porcelain(cwd).trim()).toBe("?? .gitignore");
  });

  it("fix1: the suite leaves the repo tree untouched (git status --porcelain -uall unchanged)", () => {
    expect(porcelain(REPO)).toBe(repoStatusBefore);
  });
});
