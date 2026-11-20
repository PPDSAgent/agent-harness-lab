// @vitest-environment node
// FROZEN acceptance tests for HL-017 (pseudonymisation library; criteria A3, A4).
// Written by the test engineer before the build; the builder may not edit this file.
// All planted values are SYNTHETIC made-up tokens (no real people, paths or addresses).
//
// PUBLIC CONTRACT (src/lib/pseudonymise.ts):
//   pseudonym(kind: "email"|"home"|"addr"|"person", value: string, key: string | Uint8Array): string
//       -> `${kind}-${hex}`, hex is 4 or more lowercase hex chars and a PREFIX of
//          HMAC-SHA256(key, normalised value) in hex. Normalisation includes trim + lowercase.
//   pseudonymiseText(text: string, opts: { key: string | Uint8Array; names?: readonly string[] }): string
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pseudonym, pseudonymiseText } from "../src/lib/pseudonymise";

const KEY = "synthetic-test-key-aaaaaaaa11111111";
const KEY2 = "synthetic-test-key-bbbbbbbb22222222";
const hmacHex = (key: string, v: string) => createHmac("sha256", key).update(v).digest("hex");

describe("HL-017 A3/A4 pseudonym()", () => {
  it("A3: has the form <kind>-<4+ hex>", () => {
    for (const kind of ["email", "home", "addr", "person"] as const) {
      expect(pseudonym(kind, "some-value", KEY)).toMatch(new RegExp(`^${kind}-[0-9a-f]{4,}$`));
    }
  });

  it("A3: hex is a prefix of HMAC-SHA256(key, normalised value)", () => {
    const p = pseudonym("email", "user-01@example.test", KEY);
    const hex = p.slice("email-".length);
    expect(hmacHex(KEY, "user-01@example.test").startsWith(hex)).toBe(true);
    const q = pseudonym("person", "zorblax quinterro", KEY);
    expect(hmacHex(KEY, "zorblax quinterro").startsWith(q.slice("person-".length))).toBe(true);
  });

  it("A4: same value + same key gives the same pseudonym", () => {
    expect(pseudonym("person", "zorblax quinterro", KEY)).toBe(pseudonym("person", "zorblax quinterro", KEY));
  });

  it("A3/A4: normalisation is case-insensitive and trims", () => {
    expect(pseudonym("person", "  Zorblax Quinterro ", KEY)).toBe(pseudonym("person", "zorblax quinterro", KEY));
    expect(pseudonym("email", "USER-01@Example.Test", KEY)).toBe(pseudonym("email", "user-01@example.test", KEY));
  });

  it("A4: a different key gives a different pseudonym", () => {
    expect(pseudonym("email", "user-01@example.test", KEY)).not.toBe(pseudonym("email", "user-01@example.test", KEY2));
  });

  it("A4: different values give different pseudonyms", () => {
    expect(pseudonym("email", "user-01@example.test", KEY)).not.toBe(pseudonym("email", "user-02@example.test", KEY));
  });
});

describe("HL-017 A3/A4 pseudonymiseText()", () => {
  const names = ["Zorblax Quinterro"];

  it("A3: replaces an email", () => {
    const out = pseudonymiseText("mail user-01@example.test now", { key: KEY, names });
    expect(out).not.toContain("user-01@example.test");
    expect(out).toContain(pseudonym("email", "user-01@example.test", KEY));
  });

  it("A3: replaces home paths in the three shapes", () => {
    const text = "a /Users/synthetic-07/proj b /home/synthetic-08/work c C:\\Users\\synthetic-09\\docs";
    const out = pseudonymiseText(text, { key: KEY, names });
    for (const u of ["synthetic-07", "synthetic-08", "synthetic-09"]) expect(out).not.toContain(u);
    expect(out.match(/home-[0-9a-f]{4,}/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("A3: replaces a US street address (number + street name + suffix)", () => {
    const addr = ["123", "Fakeloop", "Avenue"].join(" "); // built at test time
    const out = pseudonymiseText(`ship to ${addr} today`, { key: KEY, names });
    expect(out).not.toContain("Fakeloop");
    expect(out).toMatch(/addr-[0-9a-f]{4,}/);
    expect(out).toContain("ship to ");
    expect(out).toContain(" today");
  });

  it("A3: replaces names from the names list, case-insensitively", () => {
    const out = pseudonymiseText("Zorblax Quinterro and ZORBLAX QUINTERRO and zorblax quinterro", { key: KEY, names });
    expect(out.toLowerCase()).not.toContain("zorblax");
    expect(out.toLowerCase()).not.toContain("quinterro");
    const p = pseudonym("person", "Zorblax Quinterro", KEY);
    expect(out.split(p).length - 1).toBe(3);
  });

  it("A3: does not touch text with nothing sensitive in it", () => {
    const text = "Looking at the structure first. Ran 12 tests in 3.4s.";
    expect(pseudonymiseText(text, { key: KEY, names })).toBe(text);
  });

  it("A4: the same value in two places gets the same pseudonym", () => {
    const out = pseudonymiseText("a user-01@example.test b user-01@example.test", { key: KEY, names });
    const found = out.match(/email-[0-9a-f]{4,}/g) ?? [];
    expect(found).toHaveLength(2);
    expect(found[0]).toBe(found[1]);
  });

  it("A4: a different key changes the output", () => {
    const text = "a user-01@example.test b /Users/synthetic-07/proj c Zorblax Quinterro";
    expect(pseudonymiseText(text, { key: KEY, names })).not.toBe(pseudonymiseText(text, { key: KEY2, names }));
  });

  it("A3/A5: the key never appears in the output", () => {
    const out = pseudonymiseText("user-01@example.test", { key: KEY, names });
    expect(out).not.toContain(KEY);
  });
});
