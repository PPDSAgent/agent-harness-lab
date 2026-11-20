// HL-017: stable keyed pseudonyms for personal data (pure; no I/O, no app imports).
// Contract: tests/hl-017.pseudonymise.test.ts (frozen).
// HMAC-SHA256: RFC 2104 / FIPS 198-1, via node:crypto https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options
// Node-only: keep this file out of the app bundle (src/main.tsx graph).
import { createHmac } from "node:crypto";

export type PseudonymKind = "email" | "home" | "addr" | "person";
type Key = string | Uint8Array;

/** Hex chars kept from the HMAC. 8 (32 bits) keeps collisions rare in a few thousand values. */
const HEX_LEN = 8;

const normalise = (v: string) => v.trim().toLowerCase();

/** `<kind>-<hex prefix of HMAC-SHA256(key, trimmed lower-cased value)>` */
export function pseudonym(kind: PseudonymKind, value: string, key: Key): string {
  return `${kind}-${createHmac("sha256", key).update(normalise(value)).digest("hex").slice(0, HEX_LEN)}`;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// /Users/<u>, /home/<u>, C:\Users\<u> (the user segment is the value).
const HOME = /(?:\/(?:Users|home)\/|[A-Za-z]:\\Users\\)([^\\/\s"'`<>:;,]+)/g;
// US street address: number, 1-2 name words, street suffix. ASSUMPTION: this shape only
// (no unit lines, PO boxes or city/state); text that merely resembles it is also replaced.
const SUFFIX = "Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|Parkway|Pkwy";
const ADDR = new RegExp(`\\b\\d{1,6}\\s+(?:[A-Za-z][A-Za-z'-]*\\s+){1,2}(?:${SUFFIX})\\b`, "gi");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function pseudonymiseText(text: string, opts: { key: Key; names?: readonly string[] }): string {
  const { key } = opts;
  let out = text.replace(EMAIL, (m) => pseudonym("email", m, key));
  out = out.replace(HOME, (_m, user: string) => pseudonym("home", user, key));
  // Longest names first so "ann lee" wins over "ann".
  const names = [...new Set((opts.names ?? []).map((n) => n.trim()).filter((n) => n !== ""))].sort((a, b) => b.length - a.length);
  for (const name of names) {
    const body = name.split(/\s+/).map(escapeRe).join("\\s+");
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, "gi"), () => pseudonym("person", name, key));
  }
  return out.replace(ADDR, (m) => pseudonym("addr", m.replace(/\s+/g, " "), key));
}
