// Normalized run model shared by both harness parsers (HL-005).
// Contract: tests/hl-005.ingest.test.ts (frozen). Absent source fields are null, never 0.

export type Harness = "claude-code" | "codex" | "team";

export interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface ToolCall {
  id: string | null;
  name: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  isError: boolean | null;
  /** HL-011b: skill name for a Claude Code `Skill` tool call; null for every other call. Optional so pre-HL-011b literals still type-check; parsers always set it. */
  skill?: string | null;
}

export interface Step {
  index: number;
  timestamp: string | null;
  text: string | null;
  usage: Usage | null;
  toolCalls: ToolCall[];
  sourceLines: number[];
}

export interface Verdict {
  value: "PASS" | "CONDITIONAL" | "FAIL";
  stepIndex: number;
}

export interface Claim {
  text: string;
  hasEvidence: boolean;
  stepIndex: number;
}

/** Metadata copied from a team run record (runs/*.json, HL-008). Null = null or absent in the source. */
export interface TeamMeta {
  taskId: string | null;
  mode: string | null;
  prNumber: number | null;
  freezeSha: string | null;
  costUsd: number | null;
  branch: string | null;
  base: string | null;
  phase: string | null;
}

export interface Run {
  harness: Harness;
  id: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  steps: Step[];
  toolCalls: ToolCall[];
  usage: Usage | null;
  verdicts: Verdict[];
  claims: Claim[];
  recordCount: number;
  droppedCount: number;
  /** Only set by the team parser; absent on the other harnesses. */
  team?: TeamMeta | null;
}
