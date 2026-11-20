// Claude Code transcript JSONL -> Run (HL-005).
// Field shapes are an ASSUMPTION taken from the HL-003 fixtures (see fixtures/claude-code/README.md:
// the format docs were unreachable that run): per line `type`, `timestamp`, `sessionId`,
// `message.content[]` blocks (`text`, `tool_use`, `tool_result`), `message.usage.{input,output}_tokens`.
// Line 1 is the synthetic header and is not a record. Each record becomes exactly one step.
import { finishCall, isObj, makeUsage, newCall, readRecords, scanText, span, str, sumUsage } from "./common";
import type { Obj } from "./common";
import type { Claim, Run, Step, ToolCall, Usage, Verdict } from "./types";

export function parseClaudeCode(text: string): Run {
  const { records } = readRecords(text);
  const steps: Step[] = [];
  const toolCalls: ToolCall[] = [];
  const verdicts: Verdict[] = [];
  const claims: Claim[] = [];
  const pending = new Map<string, ToolCall>();
  const stamps: (string | null)[] = [];
  let id: string | null = null;
  let dropped = 0;

  for (const { line, obj } of records) {
    if (obj === null) {
      dropped++;
      continue;
    }
    const ts = str(obj.timestamp);
    stamps.push(ts);
    id ??= str(obj.sessionId);
    const message = isObj(obj.message) ? obj.message : null;
    const blocks: Obj[] = Array.isArray(message?.content) ? (message.content as unknown[]).filter(isObj) : [];
    const index = steps.length;
    const stepCalls: ToolCall[] = [];
    const texts: string[] = [];

    for (const b of blocks) {
      if (b.type === "text" && typeof b.text === "string" && obj.type === "assistant") {
        texts.push(b.text);
      } else if (b.type === "tool_use") {
        // ASSUMPTION: a skill call is a tool_use named "Skill" with a string input.skill (HL-011b; same
        // fixture-derived assumption as the other field shapes, see fixtures/claude-code/README.md). Else null.
        const name = str(b.name);
        const skill = name === "Skill" && isObj(b.input) && typeof b.input.skill === "string" && b.input.skill !== "" ? b.input.skill : null;
        const c = newCall(str(b.id), name, ts, skill);
        stepCalls.push(c);
        toolCalls.push(c);
        if (c.id !== null) pending.set(c.id, c);
      } else if (b.type === "tool_result") {
        const tid = str(b.tool_use_id);
        const c = tid === null ? undefined : pending.get(tid);
        if (c) finishCall(c, ts, b.is_error === true);
      }
    }
    for (const t of texts) scanText(t, index, verdicts, claims);

    const u = message && isObj(message.usage) ? message.usage : null;
    const usage: Usage | null = u ? makeUsage(u.input_tokens, u.output_tokens, null) : null;
    steps.push({
      index,
      timestamp: ts,
      text: texts.length ? texts.join("\n") : null,
      usage,
      toolCalls: stepCalls,
      sourceLines: [line],
    });
  }

  return {
    harness: "claude-code",
    id,
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
