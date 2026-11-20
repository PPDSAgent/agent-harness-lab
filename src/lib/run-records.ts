// The team's raw run records (runs/*.json, schema runs/SCHEMA.md), parsed per file; a file that is not JSON reads as null.
// Raw text import keeps the records in the lazy chunks that read them, never the entry
// (https://vite.dev/guide/features#glob-import and https://vite.dev/guide/assets#importing-asset-as-string).
// Shared by the Evidence trail section and the run-detail evidence block (moved here from evidence-trail.tsx for B1).
const raw = import.meta.glob("../../runs/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
export function loadRecords(): unknown[] {
  return Object.values(raw).map((t) => {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  });
}
