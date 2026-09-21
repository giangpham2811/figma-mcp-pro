import { describe, expect, it } from "vitest";
import { keyMatches, presentedKey } from "../../relay/src/pairing.js";

/**
 * The relay's only access check, so it gets the paranoid treatment.
 *
 * What makes it worth testing is not the happy path — it is that the check
 * has to hold for three different clients that each carry the key somewhere
 * different, and that the failure mode of getting it wrong is silent. A
 * relay that accepts a prefix of the key, or that accepts the empty string
 * because `?key=` was present but blank, is open while reporting itself as
 * closed.
 */

const url = (u: string): URL => new URL(u);
const req = (headers: Record<string, string> = {}): Request =>
  new Request("https://relay.example/mcp", { headers });

describe("where the workspace key is allowed to travel", () => {
  it("reads an Authorization: Bearer header", () => {
    expect(presentedKey(req({ Authorization: "Bearer s3cret" }), url("https://r/mcp"))).toBe("s3cret");
  });

  it("accepts the header however the client cased the scheme", () => {
    expect(presentedKey(req({ Authorization: "bearer s3cret" }), url("https://r/mcp"))).toBe("s3cret");
  });

  it("reads X-Workspace-Key, for clients that keep Authorization for themselves", () => {
    expect(presentedKey(req({ "X-Workspace-Key": "s3cret" }), url("https://r/mcp"))).toBe("s3cret");
  });

  it("reads ?key=, which is the only shape Cowork's two-field dialog can carry", () => {
    expect(presentedKey(req(), url("https://r/mcp?key=s3cret"))).toBe("s3cret");
  });

  it("prefers the header when a client sends both", () => {
    expect(presentedKey(req({ Authorization: "Bearer from-header" }), url("https://r/mcp?key=from-url"))).toBe(
      "from-header",
    );
  });

  it("treats a blank key as no key at all", () => {
    // `?key=` with nothing after it is what a half-filled config produces,
    // and "" must not be allowed to match an unset-but-truthy expectation.
    expect(presentedKey(req(), url("https://r/mcp?key="))).toBeNull();
    expect(presentedKey(req({ "X-Workspace-Key": "   " }), url("https://r/mcp"))).toBeNull();
    expect(presentedKey(req(), url("https://r/mcp"))).toBeNull();
  });
});

describe("comparing the workspace key", () => {
  const REAL = "correct-horse-battery-staple";

  it("accepts the right key", async () => {
    await expect(keyMatches(REAL, REAL)).resolves.toBe(true);
  });

  it("rejects a wrong key of the same length", async () => {
    await expect(keyMatches("correct-horse-battery-stapLe", REAL)).resolves.toBe(false);
  });

  it("rejects a prefix of the real key", async () => {
    // The bug a hand-rolled compare invites. startsWith() would pass this.
    await expect(keyMatches("correct-horse", REAL)).resolves.toBe(false);
  });

  it("rejects a key with the real one appended to junk", async () => {
    await expect(keyMatches(`x${REAL}`, REAL)).resolves.toBe(false);
  });

  it("rejects a missing key", async () => {
    await expect(keyMatches(null, REAL)).resolves.toBe(false);
    await expect(keyMatches("", REAL)).resolves.toBe(false);
  });
});
