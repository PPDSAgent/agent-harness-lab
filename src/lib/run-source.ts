import type { Run } from "@/lib/ingest";

/**
 * Where a run's data came from, for "Source:" lines (CLAUDE.md rule 2). Claude Code and Codex
 * runs are SYNTHETIC fixtures; team runs are the team's own run records (runs/*.json), which are
 * real and so must never be labelled synthetic.
 */
export function runSource(harness: Run["harness"]): string {
  return harness === "team"
    ? "the team's own run records (runs/*.json)"
    : "SYNTHETIC fixtures in fixtures/claude-code and fixtures/codex";
}
