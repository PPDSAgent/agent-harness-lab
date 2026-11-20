// HL-026: run usage meter CLI. Contract: tests/hl-026.run-usage.test.ts (frozen).
// Reads Claude Code transcript files, prints exactly one JSON object of numbers on stdout
// (never transcript text). Run with `npm run usage -- <transcript.jsonl> [...]`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { summarizeUsage } from "../lib/run-usage";

interface Out { write(chunk: string): unknown }
export interface Io { stdout: Out; stderr: Out; cwd?: string }

const USAGE = "usage: usage <transcript.jsonl> [<transcript.jsonl> ...]\n  prints one JSON object of token totals; counts each message id once across all files.";

export function main(argv: string[], io: Io): number {
  if (argv.length === 0) {
    io.stderr.write(`usage: no transcript given\n${USAGE}\n`);
    return 2;
  }
  const contents: string[] = [];
  for (const p of argv) {
    try {
      contents.push(readFileSync(resolve(io.cwd ?? process.cwd(), p), "utf8"));
    } catch {
      io.stderr.write(`usage: cannot read file: ${p}\n${USAGE}\n`);
      return 2;
    }
  }
  io.stdout.write(`${JSON.stringify(summarizeUsage(contents))}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  process.exitCode = main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, cwd: process.cwd() });
}
