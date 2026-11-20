import { parseClaudeCode, parseCodex, parseRunRecords, type Run } from "./ingest";

// Vite inlines the raw SYNTHETIC fixture JSONL at build time (https://vite.dev/guide/features#glob-import).
// README.md files are excluded by the *.jsonl glob.
const claude = import.meta.glob("../../fixtures/claude-code/*.jsonl", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const codex = import.meta.glob("../../fixtures/codex/*.jsonl", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export function loadFixtureRuns(): Run[] {
  return [
    ...Object.values(claude).map((t) => parseClaudeCode(t)),
    ...Object.values(codex).map((t) => parseCodex(t)),
  ];
}

// The team's own run records (HL-008). Only the top-level keys parseRunRecord reads are bundled:
// Vite exposes each top-level JSON key as a named export and tree-shakes the rest
// (json.namedExports, https://vite.dev/config/shared-options.html#json-namedexports), and
// import.meta.glob can import one named export per file
// (https://vite.dev/guide/features#named-imports). Unread keys (notes, perf, redteam, ...) stay out
// of the entry chunk, so every record is still parsed and counted.
// import.meta.glob options must be literals, so each key has its own call.
const keys: Record<string, Record<string, unknown>> = {
  run_date: import.meta.glob("../../runs/*.json", { import: "run_date", eager: true }),
  slot: import.meta.glob("../../runs/*.json", { import: "slot", eager: true }),
  started_at: import.meta.glob("../../runs/*.json", { import: "started_at", eager: true }),
  finished_at: import.meta.glob("../../runs/*.json", { import: "finished_at", eager: true }),
  task_id: import.meta.glob("../../runs/*.json", { import: "task_id", eager: true }),
  mode: import.meta.glob("../../runs/*.json", { import: "mode", eager: true }),
  pr_number: import.meta.glob("../../runs/*.json", { import: "pr_number", eager: true }),
  freeze_sha: import.meta.glob("../../runs/*.json", { import: "freeze_sha", eager: true }),
  cost_usd: import.meta.glob("../../runs/*.json", { import: "cost_usd", eager: true }),
  branch: import.meta.glob("../../runs/*.json", { import: "branch", eager: true }),
  base: import.meta.glob("../../runs/*.json", { import: "base", eager: true }),
  phase: import.meta.glob("../../runs/*.json", { import: "phase", eager: true }),
  tokens: import.meta.glob("../../runs/*.json", { import: "tokens", eager: true }),
  dispatches: import.meta.glob("../../runs/*.json", { import: "dispatches", eager: true }),
  checks: import.meta.glob("../../runs/*.json", { import: "checks", eager: true }),
  review: import.meta.glob("../../runs/*.json", { import: "review", eager: true }),
};

export function loadTeamRuns(): Run[] {
  const files = Object.keys(keys.run_date!);
  return parseRunRecords(
    files.map((f) => {
      const rec: Record<string, unknown> = {};
      for (const [k, byFile] of Object.entries(keys)) if (byFile[f] !== undefined) rec[k] = byFile[f];
      return JSON.stringify(rec);
    }),
  );
}
