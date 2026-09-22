import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The plugin UI is one self-contained HTML file with no module boundary, so
 * it cannot be imported. These tests pull the pure helpers out of it and run
 * them, and assert the wiring by reading the source.
 *
 * That is weaker than importing, and it is still worth having: the three
 * things checked below are the three that break silently. A relay URL built
 * wrong produces a socket that never opens; a manifest missing the domain
 * produces the same symptom from a completely different cause; and port
 * walking left switched on wastes nine dead attempts before retrying the
 * only address that can work.
 */

const ROOT = join(import.meta.dirname, "../..");
const UI = readFileSync(join(ROOT, "plugin/ui.html"), "utf8");

/** Lift the named function out of the UI source and make it callable. */
function lift(name: string, deps = ""): (...args: unknown[]) => unknown {
  const re = new RegExp(`function ${name}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n  \\}`, "m");
  const src = re.exec(UI);
  if (!src) throw new Error(`${name} not found in ui.html`);
  // eslint-disable-next-line no-new-func
  return new Function(`${deps}\n${src[0]}\nreturn ${name};`)() as (...a: unknown[]) => unknown;
}

describe("relay URL handling", () => {
  const relayOrigin = lift("relayOrigin") as (v: string) => string;

  it("accepts what people actually paste", () => {
    // Every one of these is a thing somebody will type. A strict parser
    // that only takes the canonical origin fails four out of five.
    expect(relayOrigin("https://x.workers.dev")).toBe("https://x.workers.dev");
    expect(relayOrigin("x.workers.dev")).toBe("https://x.workers.dev");
    expect(relayOrigin("  https://x.workers.dev/  ")).toBe("https://x.workers.dev");
    // Pasting the full connector URL back in is the most likely mistake,
    // because it is the string the panel just showed them.
    expect(relayOrigin("https://x.workers.dev/mcp/abc123")).toBe("https://x.workers.dev");
  });

  it("rejects nonsense instead of building a dead socket from it", () => {
    expect(relayOrigin("")).toBe("");
    expect(relayOrigin("   ")).toBe("");
    expect(relayOrigin("http://")).toBe("");
  });

  it("turns an https origin into a wss socket, with the room in the path", () => {
    const relayWsUrl = new Function(
      `var relay = { host: "https://x.workers.dev", roomId: "r o/om", key: "k&y" };
       function relayWsUrl() {
         var origin = relay.host.replace(/^http/i, "ws");
         var url = origin + "/ws/" + encodeURIComponent(relay.roomId);
         return relay.key ? url + "?key=" + encodeURIComponent(relay.key) : url;
       }
       return relayWsUrl;`,
    )() as () => string;
    // https → wss, not ws: a plain ws:// to an https origin is blocked by
    // the browser and the error names nothing useful.
    expect(relayWsUrl()).toBe("wss://x.workers.dev/ws/r%20o%2Fom?key=k%26y");
  });
});

describe("the wiring, read off the source", () => {
  it("does not walk the local port range while on a relay", () => {
    // One address. Walking nine neighbours of it spends the whole backoff
    // budget on ports that cannot answer.
    expect(UI).toMatch(/if \(advancePort && !relay\)/);
  });

  it("dials the relay when one is configured", () => {
    expect(UI).toMatch(/if \(relay\) \{[\s\S]*?url = relayWsUrl\(\)/);
  });

  it("persists pairing through the main thread, not from the iframe", () => {
    // clientStorage is unreachable from the iframe; forgetting this is how
    // a pairing survives until the panel is closed and then vanishes.
    expect(UI).toContain('toMain({ kind: "save-relay", relay: relay })');
    expect(UI).toContain('toMain({ kind: "save-relay", relay: null })');
  });

  it("reconnects immediately after pairing instead of waiting out the backoff", () => {
    // Cut at the end of the branch rather than at a character count — a
    // count is a magic number that breaks the next time a comment is added,
    // which is exactly what it did the first time this was written.
    const from = UI.indexOf('body.state === "paired"');
    const branch = UI.slice(from, UI.indexOf('body.state === "expired"', from));
    expect(branch).toContain("backoff = BACKOFF_MIN");
    expect(branch).toContain("connect();");
  });
});

describe("manifest network access", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "plugin/manifest.json"), "utf8")) as {
    editorType: string[];
    networkAccess: { allowedDomains: string[]; devAllowedDomains?: string[]; reasoning?: string };
  };

  it("runs on both surfaces", () => {
    expect(manifest.editorType.sort()).toEqual(["figjam", "figma"]);
  });

  it("allows the relay in production and localhost only in development", () => {
    const prod = manifest.networkAccess.allowedDomains;
    expect(prod).toContain("wss://*.workers.dev");
    // A published plugin dialling localhost is a published plugin reaching
    // into whatever happens to listen on the reader's machine.
    expect(prod.some((d) => d.includes("localhost"))).toBe(false);
    expect(manifest.networkAccess.devAllowedDomains?.some((d) => d.includes("localhost"))).toBe(true);
  });

  it("never asks for blanket access", () => {
    // "*" passes review only with a reason, and "talks to whatever server
    // you type in" is not one worth giving.
    expect(manifest.networkAccess.allowedDomains).not.toContain("*");
    expect(manifest.networkAccess.reasoning ?? "").not.toHaveLength(0);
  });
});

describe("restoring a saved relay on open", () => {
  /** The `case "handshake":` arm, up to its `break;`. */
  const handshake = (() => {
    const start = UI.indexOf('case "handshake":');
    if (start < 0) throw new Error('no handshake case in ui.html');
    const end = UI.indexOf("break;", start);
    return UI.slice(start, end);
  })();

  /**
   * The panel showed a pairing code for a relay it was not connected to,
   * and nothing on screen contradicted that.
   *
   * `connect()` runs at the bottom of ui.html the moment the script loads,
   * when `relay` is still null — so it dials localhost. The handshake that
   * restores a saved relay arrives after that, and used to only repaint.
   * So the code and the /mcp URL appeared, looking exactly like success,
   * while the socket served the local bridge and the relay logged nothing
   * at all. Two and a half minutes of live relay logs during the hunt:
   * zero requests, while the user was looking at a pairing code.
   */
  it("dials the relay after restoring one, instead of only repainting", () => {
    expect(handshake).toContain("relay = msg.relay");
    expect(
      /relay = msg\.relay[\s\S]*?connect\(\)/.test(handshake),
      "handshake restores a saved relay but never re-dials; the socket stays on localhost while the panel advertises the relay",
    ).toBe(true);
  });

  it("drops the localhost socket before re-dialling, so both are not open", () => {
    expect(
      /relay = msg\.relay[\s\S]*?ws\.close\(\)[\s\S]*?connect\(\)/.test(handshake),
      "re-dial without closing the existing socket leaves the localhost one live",
    ).toBe(true);
  });
});
