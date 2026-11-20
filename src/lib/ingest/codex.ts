// Codex CLI rollout JSONL -> Run (HL-005).
// Source (openai/codex @ 444359fa2d71b9313c902c6bd6fd598ed6d8f799), as cited in fixtures/README.md:
// codex-rs/history/src/lib.rs:388 (RolloutLine), codex-rs/protocol/src/protocol.rs (SessionMeta,
// EventMsg token_count / agent_message), codex-rs/protocol/src/models.rs (function_call,
// function_call_output). ASSUMPTION: `output` is a plain string and failures start "error:" (fixture
// convention, unconfirmed against a real rollout). Line 1 is session_meta, not a record.
// Each record becomes exactly one step; only `event_msg` agent_message carries step text
// (the matching response_item message repeats it and has text null).
import { finishCall, isObj, makeUsage, newCall, readRecords, scanText, span, str, sumUsage } from "./common";
import type { Claim, Run, Step, ToolCall, Usage, Verdict } from "./types";

export function parseCodex(text: string): Run {
  const { header, records } = readRecords(text);
  const steps: Step[] = [];
  const toolCalls: ToolCall[] = [];
  const verdicts: Verdict[] = [];
  const claims: Claim[] = [];
  const pending = new Map<string, ToolCall>();
  const stamps: (string | null)[] = [];
  let dropped = 0;

  for (const { line, obj } of records) {
    if (obj === null) {
      dropped++;
      continue;
    }
    const ts = str(obj.timestamp);
    stamps.push(ts);
    const p = isObj(obj.payload) ? obj.payload : {};
    const index = steps.length;
    const stepCalls: ToolCall[] = [];
    let stepText: string | null = null;
    let usage: Usage | null = null;

    if (obj.type === "event_msg" && p.type === "agent_message" && typeof p.message === "string") {
      stepText = p.message;
      scanText(p.message, index, verdicts, claims);
    } else if (obj.type === "event_msg" && p.type === "token_count") {
      const last = isObj(p.info) && isObj(p.info.last_token_usage) ? p.info.last_token_usage : null;
      if (last) usage = makeUsage(last.input_tokens, last.output_tokens, last.total_tokens);
    } else if (obj.type === "response_item" && p.type === "function_call") {
      const c = newCall(str(p.call_id), str(p.name), ts);
      stepCalls.push(c);
      toolCalls.push(c);
      if (c.id !== null) pending.set(c.id, c);
    } else if (obj.type === "response_item" && p.type === "function_call_output") {
      const cid = str(p.call_id);
      const c = cid === null ? undefined : pending.get(cid);
      if (c) finishCall(c, ts, typeof p.output === "string" && p.output.startsWith("error:"));
    }
    steps.push({ index, timestamp: ts, text: stepText, usage, toolCalls: stepCalls, sourceLines: [line] });
  }

  const payload = header && isObj(header.payload) ? header.payload : null;
  return {
    harness: "codex",
    id: payload ? str(payload.id) : null,
    ...span(stamps),
    steps,
    toolCalls,
    usage: sumUsage(steps),
    verdicts,
    claims,
    recordCount: records.length,
    droppedCount: dropped,
  };
}
