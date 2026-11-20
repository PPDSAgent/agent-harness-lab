// HL-027: cost-export importer CLI. Contract: tests/hl-027.cost-import.test.ts (frozen).
// Fills run records' cost_usd from a usage/cost export. Prints one JSON object of numbers
// on stdout (never export cells). Run with `npm run cost -- [--write] <export.csv> <run.json> [...]`.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CostError, SOURCE, matchRuns, parseExport, toWindow, type RunWindow } from "../lib/cost-import";

interface Out { write(chunk: string): unknown }
export interface Io { stdout: Out; stderr: Out; cwd?: string }

const USAGE = "usage: cost [--write] <export.csv> <run.json> [<run.json> ...]\n  prints one JSON object; --write also sets cost_usd in each run file.";

export function main(argv: string[], io: Io): number {
  const write = argv.includes("--write");
  const paths = argv.filter((a) => a !== "--write");
  const fail = (msg: string): number => {
    io.stderr.write(`cost: ${msg}\n${USAGE}\n`);
    return 2;
  };
  if (paths.length < 2) return fail("need an export file and at least one run file");
  const cwd = io.cwd ?? process.cwd();
  const [exportPath, ...runPaths] = paths;
  try {
    let text: string;
    try {
      text = readFileSync(resolve(cwd, exportPath), "utf8");
    } catch {
      throw new CostError(`cannot read file: ${exportPath}`);
    }
    const rows = parseExport(text);
    const objs: Array<Record<string, unknown>> = [];
    const windows: RunWindow[] = [];
    for (const p of runPaths) {
      let raw: string;
      try {
        raw = readFileSync(resolve(cwd, p), "utf8");
      } catch {
        throw new CostError(`cannot read file: ${p}`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new CostError(`run file is not valid JSON: ${p}`);
      }
      windows.push(toWindow(p, parsed));
      objs.push(parsed as Record<string, unknown>);
    }
    const results = matchRuns(rows, windows);
    if (write) {
      results.forEach((r, i) => {
        objs[i].cost_usd = r.cost_usd;
        writeFileSync(resolve(cwd, runPaths[i]), `${JSON.stringify(objs[i], null, 2)}\n`);
      });
    }
    io.stdout.write(`${JSON.stringify({ source: SOURCE, runs: results })}\n`);
    return 0;
  } catch (e) {
    if (e instanceof CostError) return fail(e.message);
    throw e;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  process.exitCode = main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, cwd: process.cwd() });
}
