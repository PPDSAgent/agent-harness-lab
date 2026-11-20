// HL-026: run usage meter logic. Contract: tests/hl-026.run-usage.test.ts (frozen).
// Sums token usage from Claude Code session transcripts so a run record's `tokens` and
// `cost_usd` come from a measurement. It never multiplies tokens by a price (rule 5).
//
// ASSUMPTION: transcript shape, observed by the lead in a cloud Claude Code session
// transcript, not from any documentation. One JSON object per line. API responses are lines
// with `"type":"assistant"`, `message.id` and `message.usage` holding integer
// `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`.
// One API message is split over several lines (one per content block) that repeat the same
// `message.id` and identical usage, so each id is counted once. No USD cost field was seen.
// Older transcripts may carry a numeric top-level `costUSD` per assistant line (unverified).

export const TOKEN_FIELDS = [
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
] as const;
type TokenField = (typeof TOKEN_FIELDS)[number];

export interface RunUsage {
  tokens: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  messages: number;
  files: number;
  skipped_lines: number;
  cost_usd: number | null;
  cost_source: string;
}

interface Seen {
  fields: Partial<Record<TokenField, number>>;
  cost?: number;
}

const COST_MEASURED = "summed from per-message costUSD fields in the transcript";
const COST_MISSING =
  "no measured cost in the transcript: read the figure from the account's billing usage/cost report for the run's time window; tokens are never priced here";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Sum usage over transcript file contents, counting each `message.id` once across all of them. */
export function summarizeUsage(contents: string[]): RunUsage {
  const byId = new Map<string, Seen>();
  let skipped = 0;
  for (const text of contents) {
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      let rec: unknown;
      try {
        rec = JSON.parse(line);
      } catch {
        skipped++;
        continue;
      }
      if (!isObj(rec) || rec.type !== "assistant" || !isObj(rec.message)) continue;
      const id = rec.message.id;
      if (typeof id !== "string" || id === "") continue;
      let seen = byId.get(id);
      if (!seen) byId.set(id, (seen = { fields: {} }));
      // Lines of one message repeat identical usage; take the first value seen per field.
      const usage = rec.message.usage;
      if (isObj(usage)) {
        for (const f of TOKEN_FIELDS) {
          const v = usage[f];
          if (seen.fields[f] === undefined && isCount(v)) seen.fields[f] = v;
        }
      }
      if (seen.cost === undefined && isCount(rec.costUSD)) seen.cost = rec.costUSD;
    }
  }

  const all = [...byId.values()];
  const total = (f: TokenField): number | null =>
    all.length > 0 && all.every((m) => m.fields[f] !== undefined) ? all.reduce((s, m) => s + (m.fields[f] as number), 0) : null;
  const [input, output, creation, read] = TOKEN_FIELDS.map(total);
  const parts = [input, output, creation, read];
  const measured = all.length > 0 && all.every((m) => m.cost !== undefined);
  return {
    tokens: parts.every((p) => p !== null) ? (parts as number[]).reduce((a, b) => a + b, 0) : null,
    input_tokens: input,
    output_tokens: output,
    cache_creation_input_tokens: creation,
    cache_read_input_tokens: read,
    messages: all.length,
    files: contents.length,
    skipped_lines: skipped,
    cost_usd: measured ? all.reduce((s, m) => s + (m.cost as number), 0) : null,
    cost_source: measured ? COST_MEASURED : COST_MISSING,
  };
}
