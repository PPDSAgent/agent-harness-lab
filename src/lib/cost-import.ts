// HL-027: cost-export importer logic. Contract: tests/hl-027.cost-import.test.ts (frozen).
// Sums the dollar amounts of a usage/cost export over each run's window. It never prices
// tokens and never returns an export cell other than the summed numbers.
//
// ASSUMPTION: the export layout below is NOT confirmed. It is modelled on the bucketed
// shape of Anthropic's Usage and Cost Admin API
// (https://platform.claude.com/docs/en/manage-claude/usage-cost-api) and the Console cost
// reporting page (https://support.claude.com/en/articles/9534590-cost-and-usage-reporting-in-the-claude-console).
// Neither URL was read in this run (the cloud session could not fetch them). Assumed:
//   - optional leading `#` comment lines, one header row, then data rows; blank lines ignored;
//     RFC 4180 quoting (double-quoted fields, commas inside, `""` is a literal quote);
//   - required columns by exact header name, any order: `starting_at`, `ending_at`
//     (ISO 8601 UTC, half-open bucket [starting_at, ending_at)), `amount` (decimal string,
//     US dollars, not cents), `currency` (must be `USD`); other columns are ignored.
// Will must confirm the real column names and the amount unit (task block, needs:will).

export const SOURCE = "Anthropic usage/cost export (CSV; layout is an ASSUMPTION)";
export const REQUIRED = ["starting_at", "ending_at", "amount", "currency"] as const;

export class CostError extends Error {}

export interface Row { b0: number; b1: number; amount: number }
export interface RunWindow { file: string; startedAt: string; finishedAt: string | null; s: number; f: number | null }
export interface RunResult {
  file: string; started_at: string; finished_at: string | null;
  cost_usd: number | null; rows: number; reason: string;
}

// Parse RFC 4180 records. Returns each record with the 1-based line it starts on.
// Lines starting with `#` (at record start) and blank lines are skipped.
export function parseCsv(text: string): Array<{ line: number; fields: string[] }> {
  const out: Array<{ line: number; fields: string[] }> = [];
  let i = 0;
  let line = 1;
  const n = text.length;
  while (i < n) {
    // record start
    if (text[i] === "#") {
      while (i < n && text[i] !== "\n") i++;
      i++; line++;
      continue;
    }
    if (text[i] === "\n" || (text[i] === "\r" && text[i + 1] === "\n")) {
      i += text[i] === "\r" ? 2 : 1; line++;
      continue;
    }
    const startLine = line;
    const fields: string[] = [];
    let field = "";
    for (;;) {
      if (text[i] === '"') {
        i++;
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            break;
          }
          if (text[i] === "\n") line++;
          field += text[i++];
        }
      }
      while (i < n && text[i] !== "," && text[i] !== "\n" && !(text[i] === "\r" && text[i + 1] === "\n")) field += text[i++];
      fields.push(field);
      field = "";
      if (text[i] === ",") { i++; continue; }
      if (i < n) { i += text[i] === "\r" ? 2 : 1; line++; }
      break;
    }
    out.push({ line: startLine, fields });
  }
  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
export function parseTs(v: unknown): number | null {
  if (typeof v !== "string" || !ISO.test(v.trim())) return null;
  const t = Date.parse(v.trim());
  return Number.isNaN(t) ? null : t;
}

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

// Parse and validate an export. Errors name the 1-based line and column, never the value.
export function parseExport(text: string): Row[] {
  const recs = parseCsv(text);
  if (recs.length === 0) throw new CostError("export has no header row");
  const header = recs[0].fields.map((h) => h.trim());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length > 0) throw new CostError(`export is missing required column(s): ${missing.join(", ")}`);
  const idx = Object.fromEntries(REQUIRED.map((c) => [c, header.indexOf(c)])) as Record<(typeof REQUIRED)[number], number>;
  const rows: Row[] = [];
  for (const rec of recs.slice(1)) {
    const cell = (c: (typeof REQUIRED)[number]) => (rec.fields[idx[c]] ?? "").trim();
    const bad = (c: string) => new CostError(`export line ${rec.line}: invalid value in column ${c}`);
    const b0 = parseTs(cell("starting_at"));
    if (b0 === null) throw bad("starting_at");
    const b1 = parseTs(cell("ending_at"));
    if (b1 === null || b1 <= b0) throw bad("ending_at");
    const a = cell("amount");
    if (!DECIMAL.test(a) || !Number.isFinite(Number(a))) throw bad("amount");
    if (cell("currency") !== "USD") throw bad("currency");
    rows.push({ b0, b1, amount: Number(a) });
  }
  return rows;
}

// Validate a parsed run-file value; `file` is the path as given (used in messages).
export function toWindow(file: string, obj: unknown): RunWindow {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) throw new CostError(`run file is not a JSON object: ${file}`);
  const o = obj as Record<string, unknown>;
  const s = parseTs(o.started_at);
  if (s === null) throw new CostError(`run file has an unparsable started_at: ${file}`);
  let f: number | null = null;
  if (o.finished_at !== null && o.finished_at !== undefined) {
    f = parseTs(o.finished_at);
    if (f === null) throw new CostError(`run file has an unparsable finished_at: ${file}`);
  }
  return { file, startedAt: o.started_at as string, finishedAt: f === null ? null : (o.finished_at as string), s, f };
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function matchRuns(rows: Row[], runs: RunWindow[]): RunResult[] {
  const overlaps = (r: Row, w: RunWindow) => w.f !== null && r.b0 < w.f && r.b1 > w.s;
  const inside = (r: Row, w: RunWindow) => w.f !== null && w.s <= r.b0 && r.b1 <= w.f;
  return runs.map((w, wi): RunResult => {
    const base = { file: w.file, started_at: w.startedAt, finished_at: w.finishedAt };
    const none = (reason: string): RunResult => ({ ...base, cost_usd: null, rows: 0, reason });
    if (w.f === null) return none("no finished_at: run has not finished");
    const touching = rows.filter((r) => overlaps(r, w));
    if (touching.length === 0) return none("no match: no export row overlaps the run window");
    const ins = touching.filter((r) => inside(r, w));
    if (ins.length < touching.length) return none("ambiguous: an export bucket straddles the run window");
    const shared = ins.some((r) => runs.some((o, oi) => oi !== wi && overlaps(r, o)));
    if (shared) return none("ambiguous: an export bucket is shared with another run on the command line");
    const total = round6(ins.reduce((acc, r) => acc + r.amount, 0));
    return { ...base, cost_usd: total, rows: ins.length, reason: `summed ${ins.length} export row(s)` };
  });
}
