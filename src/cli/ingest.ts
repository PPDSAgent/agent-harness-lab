// HL-017: local ingest CLI for real logs. Contract: tests/hl-017.ingest-cli.test.ts (frozen).
// Reads three source dirs, prints one pseudonymised line per run plus per-source totals.
// Writes nothing by default (stdout/stderr only). `--stop-check` writes a report and a history file under the ignored local/stop-check/. Run on the owner's machine, attended.
// Not imported by the app entry graph (src/main.tsx); run it with `npm run ingest -- <flags>`.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseClaudeCode, parseCodex, parseRunRecord } from "../lib/ingest";
import type { Run } from "../lib/ingest";
import { answerP1Questions } from "../lib/p1-questions";
import { pseudonymiseText } from "../lib/pseudonymise";
import { answeredFlags, isIsoDate, parseHistory, stopRuleTripped, toEntry } from "../lib/stop-check";

interface Out { write(chunk: string): unknown }
export interface Io { stdout: Out; stderr: Out; env?: Record<string, string | undefined>; cwd?: string }

const USAGE = `usage: ingest [--claude-code <dir>] [--codex <dir>] [--runs <dir>] --key-file <path> [--names-file <path>]
  at least one source dir is required; the key file may also come from HL_PSEUDONYM_KEY_FILE.
       ingest --stop-check [--now <YYYY-MM-DD>] <same sources and key flags>
  recurring P1 check: prints only yes/no per question; the full report and a history log go to
  local/stop-check/ under the current directory, which must be a git tree that ignores it.`;

const SOURCES = [
  { flag: "--claude-code", label: "claude-code", ext: ".jsonl", parse: parseClaudeCode },
  { flag: "--codex", label: "codex", ext: ".jsonl", parse: parseCodex },
  { flag: "--runs", label: "runs", ext: ".json", parse: parseRunRecord },
] as const;
const VALUE_FLAGS = new Set<string>([...SOURCES.map((s) => s.flag), "--key-file", "--names-file", "--now"]);

class UsageError extends Error {}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    let flag = argv[i];
    if (flag === "--stop-check") {
      args.set(flag, "");
      continue;
    }
    let value: string | undefined;
    const eq = flag.indexOf("=");
    if (flag.startsWith("--") && eq > 0) {
      value = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    }
    if (!VALUE_FLAGS.has(flag)) throw new UsageError(`unknown argument: ${flag}`);
    value ??= argv[++i];
    if (value === undefined || value === "") throw new UsageError(`${flag} needs a value`);
    args.set(flag, value);
  }
  return args;
}

/** True when `path` sits inside any git working tree (so the key could be committed by accident). */
function inGitTree(path: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dirname(path), stdio: "ignore" });
    return true;
  } catch {
    return false; // not a repo, or git missing
  }
}

function readKey(path: string): string {
  let real: string;
  let text: string;
  try {
    real = realpathSync(path);
    text = readFileSync(real, "utf8");
  } catch {
    throw new UsageError(`cannot read key file: ${path}`);
  }
  if (text.trim() === "") throw new UsageError(`key file is empty: ${path}`);
  if (inGitTree(real)) throw new UsageError(`key file is inside a git working tree; keep it outside any repo: ${path}`);
  return text; // raw text is the HMAC key
}

function listFiles(dir: string, ext: string): string[] {
  let isDir = false;
  try {
    isDir = statSync(dir).isDirectory();
  } catch {
    /* handled below */
  }
  if (!isDir) throw new UsageError(`not a readable directory: ${dir}`);
  try {
    return readdirSync(dir).filter((f) => f.endsWith(ext)).sort().map((f) => join(dir, f));
  } catch {
    throw new UsageError(`not a readable directory: ${dir}`);
  }
}

function describe(r: Run): string {
  const tokens = r.usage?.totalTokens ?? r.usage?.inputTokens;
  const parts = [
    r.id ?? "(no id)", r.harness, r.startedAt ?? "-", `steps=${r.steps.length}`, `tools=${r.toolCalls.length}`,
    `tokens=${tokens ?? "-"}`, `verdict=${r.verdicts.at(-1)?.value ?? "-"}`,
  ];
  if (r.team) parts.push(`task=${r.team.taskId ?? "-"}`, `branch=${r.team.branch ?? "-"}`);
  return parts.join(" ");
}

const STOP_DIR = "local/stop-check";
const HISTORY = `${STOP_DIR}/history.jsonl`;

const git = (cwd: string, a: string[]): number => {
  try {
    execFileSync("git", a, { cwd, stdio: "ignore" });
    return 0;
  } catch (e) {
    return typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : 128;
  }
};

/** HL-020: yes/no per P1 question on stdout; details and history only under a git-ignored local path. */
function stopCheck(sources: Array<{ s: (typeof SOURCES)[number]; files: string[] }>, io: Io, nowArg: string | undefined): number {
  const cwd = io.cwd ?? process.cwd();
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const now = nowArg ?? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Preconditions first, so a refusal writes nothing: a git tree, the path ignored, history not tracked.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportRel = `${STOP_DIR}/${now}-${stamp}.json`;
  const ignored = [HISTORY, reportRel].every((p) => git(cwd, ["check-ignore", "-q", "--", p]) === 0);
  const tracked = git(cwd, ["ls-files", "--error-unmatch", "--", HISTORY]) === 0;
  if (!ignored || tracked) {
    io.stderr.write(`ingest: refusing to write: ${STOP_DIR}/ must be inside a git working tree that ignores it, and ${HISTORY} must not be tracked\n`);
    return 1;
  }

  const runs: Run[] = [];
  for (const { s, files } of sources) {
    for (const f of files) {
      try {
        const run = s.parse(readFileSync(f, "utf8"));
        if (run.id !== null) runs.push(run);
      } catch {
        /* unparseable file: counts as no data */
      }
    }
  }
  const answers = answerP1Questions(runs);
  const flags = answeredFlags(answers);

  const dir = resolve(cwd, STOP_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(cwd, reportRel), `${JSON.stringify({ date: now, answers }, null, 2)}\n`, { flag: "wx" });
  let prior = "";
  try {
    prior = readFileSync(join(dir, "history.jsonl"), "utf8");
  } catch {
    /* first check */
  }
  const entry = toEntry(now, flags);
  appendFileSync(join(dir, "history.jsonl"), `${prior === "" || prior.endsWith("\n") ? "" : "\n"}${JSON.stringify(entry)}\n`);
  const tripped = stopRuleTripped([...parseHistory(prior), entry]);

  const un = flags.flatMap((v, i) => (v === "no" ? [`Q${i + 1}`] : []));
  io.stdout.write(
    [
      `Q1 which skill fails most often: ${flags[0]}`,
      `Q2 what each scheduled run costs: ${flags[1]}`,
      `Q3 which claims lack evidence: ${flags[2]}`,
      `three questions answered: ${un.length === 0 ? "yes" : "no"}`,
      `unanswered: ${un.length === 0 ? "none" : un.join(", ")}`,
      `stop rule P1: ${tripped ? "tripped" : "not tripped"}`,
      "Reminder: Has it changed a decision about Clark? Log your answer yourself; this tool records none.",
    ].join("\n") + "\n",
  );
  return 0;
}

export async function main(argv: string[], io: Io): Promise<number> {
  const env = io.env ?? process.env;
  let args: Map<string, string>;
  let key: string;
  let keyPath: string;
  let names: string[] = [];
  const sources: Array<{ s: (typeof SOURCES)[number]; files: string[] }> = [];
  try {
    args = parseArgs(argv);
    const now = args.get("--now");
    if (now !== undefined && !isIsoDate(now)) throw new UsageError("--now must be YYYY-MM-DD");
    if (!args.has("--stop-check") && now !== undefined) throw new UsageError("--now only applies with --stop-check");
    if (!SOURCES.some((s) => args.has(s.flag))) throw new UsageError("give at least one of --claude-code, --codex, --runs");
    const kp = args.get("--key-file") ?? env.HL_PSEUDONYM_KEY_FILE;
    if (!kp) throw new UsageError("no key file: pass --key-file <path> or set HL_PSEUDONYM_KEY_FILE");
    keyPath = resolve(io.cwd ?? process.cwd(), kp);
    key = readKey(keyPath);
    const np = args.get("--names-file");
    if (np) {
      try {
        names = readFileSync(resolve(io.cwd ?? process.cwd(), np), "utf8").split("\n").map((n) => n.trim()).filter((n) => n !== "");
      } catch {
        throw new UsageError(`cannot read names file: ${np}`);
      }
    }
    for (const s of SOURCES) {
      const d = args.get(s.flag);
      if (d !== undefined) sources.push({ s, files: listFiles(resolve(io.cwd ?? process.cwd(), d), s.ext) });
    }
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    io.stderr.write(`ingest: ${e.message}\n${USAGE}\n`);
    return 2;
  }

  if (args.has("--stop-check")) return stopCheck(sources, io, args.get("--now"));

  const show = (t: string) => pseudonymiseText(t, { key, names });
  io.stdout.write(
    `PRIVACY: this runs locally on this machine and writes no files (output goes to this terminal only).\n` +
      `Names, emails, home paths and street addresses are pseudonymised before display (HMAC-SHA256 under the key file: ${keyPath}).\n` +
      `The key is never printed. Names are only replaced if listed in --names-file${names.length ? "" : " (none given)"}.\n\n`,
  );
  for (const { s, files } of sources) {
    let parsed = 0, skipped = 0, dropped = 0;
    for (const f of files) {
      let run: Run | null;
      try {
        run = s.parse(readFileSync(f, "utf8"));
      } catch {
        run = null;
      }
      if (run === null || run.id === null) {
        skipped++;
        continue;
      }
      parsed++;
      dropped += run.droppedCount;
      io.stdout.write(`${show(describe(run))}\n`);
    }
    io.stdout.write(`${s.label} total ${files.length} files: parsed ${parsed}, skipped ${skipped}, dropped ${dropped} records\n`);
  }
  return 0;
}

// Direct execution (npm run ingest). Guarded so tests can import main without running it.
if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, env: process.env, cwd: process.cwd() }).then(
    (code) => { process.exitCode = code; },
  );
}
