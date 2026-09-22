import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOLS } from "../../src/server/index.js";
import { DOC_SECTION_NAMES } from "../../src/server/docs-content/index.js";
import { READ_OPERATIONS } from "../../src/shared/protocol.js";

/**
 * The shipped markdown makes claims about this codebase, and a claim that has
 * drifted is worse than no claim: a reader calls the tool the doc names, it
 * does not exist, and the failure reads as the tool's fault.
 *
 * It drifted exactly that way once. `figma_userflow` became `figma_diagram`
 * type:"userflow", and for nine commits README.md, ARCHITECTURE.md and
 * TOOLS.md went on advertising it as a seventh tool — with anchor links to a
 * section that had been renamed out from under them. Four `figma_read`
 * operations shipped with no row in the reference table at all.
 *
 * `skills/` has had this guard since it shipped (see skills-claims.test.ts);
 * `docs/` did not, which is why `docs/` is what rotted. So the same rule the
 * kit preaches applies here: a sentence that says "call this" has to point at
 * something real, and a test has to say so.
 */

const ROOT = join(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const TOOL_NAMES = TOOLS.map((t) => t.name).sort();
const tools = read("docs/TOOLS.md");
const arch = read("ARCHITECTURE.md");

/**
 * README is NOT checked here any more, and that is deliberate.
 *
 * It used to carry a tool table and a diagram-kind count, so it was a
 * reference document and had to be kept honest like one. It is now the
 * install page a non-technical user lands on: no tool names, no `type`
 * values, nothing for this suite to verify. Asserting a tool table against
 * a page that should not have one would push the next author to add one
 * back, which is the opposite of what the split was for.
 *
 * The claims did not disappear — they moved. docs/TOOLS.md and
 * ARCHITECTURE.md are the reference documents, and both are still checked
 * below, so a tool renamed or a kind added still fails a test.
 *
 * One exception, at the bottom of this file: the relay URL. That is not a
 * claim about the code, it is a string the reader copies, and it is the one
 * thing on the install page that can be wrong in a way the reader cannot
 * diagnose.
 */

/** Tool names that once existed. Naming one as callable is the bug. */
const RETIRED = ["figma_userflow", "figma_flowchart"];

/** First column of a `| \`figma_x\` | …` table row. */
function tableRows(body: string): string[] {
  return [...body.matchAll(/^\| `(figma_[a-z_]+)` \|/gm)].map((m) => m[1]!).sort();
}

describe("the shipped docs", () => {
  it("gives every tool — and only the tools that exist — a section in TOOLS.md", () => {
    const headings = [...tools.matchAll(/^## `(figma_[a-z_]+)`$/gm)].map((m) => m[1]!).sort();
    expect(headings).toEqual(TOOL_NAMES);
  });

  it("lists every tool — and only the tools that exist — in the ARCHITECTURE table", () => {
    expect(tableRows(arch)).toEqual(TOOL_NAMES);
  });

  it("counts the diagram kinds correctly, in words", () => {
    // Both files say the number in PROSE — "eight diagram kinds", "Eight
    // kinds behind one `type`" — and prose is what rots when a kind lands.
    // Both were a kind behind within an hour of sitemap shipping, and
    // nothing failed: the tables they sit beside were still right.
    const kinds = ((): string[] => {
      const tool = TOOLS.find((t) => t.name === "figma_diagram")!;
      const schema = tool.inputSchema as { properties?: { type?: { enum?: string[] } } };
      return schema.properties?.type?.enum ?? [];
    })();
    const WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    const n = WORD[kinds.length]!;
    // The claim sites are NAMED, not pattern-matched. A regex for "<word>
    // kinds" also catches "write handlers fall into two kinds", which is
    // true and about something else — a guard that cries wolf gets deleted.
    // The cost is that a NEW sentence claiming a count is not covered until
    // somebody adds it here, which is the honest trade.
    const CLAIMS: Array<[string, string, string]> = [
      ["ARCHITECTURE.md", arch, `${n[0]!.toUpperCase()}${n.slice(1)} kinds behind one \`type\``],
      [
        "ARCHITECTURE.md",
        arch,
        // "the other" — every kind but the userflow the paragraph describes.
        `The other ${WORD[kinds.length - 1]!} kinds share that split`,
      ],
    ];
    for (const [rel, body, claim] of CLAIMS) {
      expect(body, `${rel} no longer says "${claim}" — there are ${kinds.length} kinds now`).toContain(
        claim,
      );
    }
  });

  it("names every diagram kind where it lists them, and no kind that does not exist", () => {
    const tool = TOOLS.find((t) => t.name === "figma_diagram")!;
    const kinds = (tool.inputSchema as { properties?: { type?: { enum?: string[] } } })
      .properties?.type?.enum ?? [];
    for (const [rel, body] of [
      ["ARCHITECTURE.md", arch],
      ["docs/TOOLS.md", tools],
    ] as const) {
      for (const k of kinds) {
        expect(body, `${rel} never mentions the "${k}" kind`).toContain(k);
      }
    }
  });

  it("lists exactly the figma_docs sections that exist, wherever it lists them", () => {
    // Three copies of one list, kept by hand. ARCHITECTURE.md had been
    // missing `demo` since that feature shipped, and both files were missing
    // `sitemap`; a reader following either one asks for a section that is
    // there and never learns about the ones that are.
    for (const [rel, body] of [
      ["ARCHITECTURE.md", arch],
    ] as const) {
      for (const name of DOC_SECTION_NAMES) {
        expect(body, `${rel}'s figma_docs list is missing "${name}"`).toContain(`\`${name}\``);
      }
    }
  });

  it("never presents a retired tool as one to call", () => {
    for (const [rel, body] of [
      ["docs/TOOLS.md", tools],
      ["ARCHITECTURE.md", arch],
      ["docs/RECIPES.md", read("docs/RECIPES.md")],
      ["docs/SETUP.md", read("docs/SETUP.md")],
      ["docs/INSTALL.md", read("docs/INSTALL.md")],
    ] as const) {
      for (const dead of RETIRED) {
        for (const line of body.split("\n")) {
          if (!line.includes(dead)) continue;
          // The one legitimate mention is a migration note that says so.
          expect(
            /\b0\.1\.0\b|was a separate tool|renamed?\b/.test(line),
            `${rel} names the retired ${dead} without saying it is retired:\n  ${line.trim()}`,
          ).toBe(true);
        }
      }
    }
  });

  it("documents every figma_read operation", () => {
    const table = tools.slice(tools.indexOf("### Read operations"), tools.indexOf("### `layout_audit(nodeId)`"));
    const missing = READ_OPERATIONS.filter((op) => !table.includes(`\`${op}\``));
    expect(missing, "read operations with no row in the reference table").toEqual([]);
  });

  it("documents every figma_docs section and every diagram type", () => {
    for (const section of DOC_SECTION_NAMES) {
      expect(tools, `figma_docs section "${section}" is not listed`).toContain(`\`${section}\``);
    }
    const schema = TOOLS.find((t) => t.name === "figma_diagram")!.inputSchema as {
      properties?: { type?: { enum?: string[] } };
    };
    for (const kind of schema.properties?.type?.enum ?? []) {
      expect(tools, `diagram type "${kind}" has no section`).toContain(`### \`type: "${kind}"\``);
    }
  });

  it("has no intra-page anchor link that points at a heading it does not have", () => {
    for (const [rel, body] of [
      ["docs/TOOLS.md", tools],
      ["ARCHITECTURE.md", arch],
      ["docs/RECIPES.md", read("docs/RECIPES.md")],
    ] as const) {
      const slugs = new Set(
        [...body.matchAll(/^#{1,6} (.+)$/gm)].map((m) =>
          // GitHub's rule: lowercase, drop punctuation, then one hyphen per
          // remaining space — runs are NOT collapsed, which is why a heading
          // with an em-dash anchors with a double hyphen.
          m[1]!.trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s/g, "-"),
        ),
      );
      // Only same-file links: `](#…)`, not `](./OTHER.md#…)`.
      for (const m of body.matchAll(/\]\(#([^)]+)\)/g)) {
        expect(slugs, `${rel} links to #${m[1]}, which is not a heading in it`).toContain(m[1]!);
      }
    }
  });
  /**
   * The URL a user copies out of README has to be the one the plugin dials.
   *
   * This is the worst drift in the repo to leave untested, because it does
   * not fail loudly. Point Cowork at relay A and the plugin at relay B and
   * both connect happily — to different rooms. Cowork then reports "no
   * plugin connected" while the plugin sits there showing a code, and
   * nothing anywhere names the real problem. A reader will re-run the
   * install three times before suspecting the host.
   *
   * So: one host, written in three places, asserted identical — and asserted
   * to match the Worker that actually gets deployed, since renaming it in
   * wrangler.jsonc is the likeliest way to break all three at once.
   */
  it("gives the same relay host in the README, the operator doc and the plugin", () => {
    // README is the copy-paste source, so it defines the answer; the other
    // two have to agree with it.
    // `?key=…` is optional on purpose: the relay only demands a workspace
    // key when one is configured, so the install page has to be allowed to
    // show either shape. What is NOT optional is that whatever follows
    // `key=` is a placeholder — see the leak test below.
    const readme = /```\nhttps:\/\/([a-z0-9.-]+)\/mcp(?:\?key=[^\n]*)?\n```/.exec(read("README.md"));
    expect(readme, "README no longer shows a relay URL in a copyable block").not.toBeNull();
    const host = readme![1]!;

    // Pinned to the constant, not to "somewhere in the file": ui.html also
    // carries `https://ten-relay.workers.dev` as placeholder text in the
    // host input, and an example is supposed to differ from the real thing.
    expect(
      read("plugin/ui.html"),
      "plugin/ui.html dials a different relay than the README tells people to paste",
    ).toContain(`var DEFAULT_RELAY = "https://${host}";`);

    expect(read("docs/COWORK.md"), "docs/COWORK.md names a different relay").toContain(host);

    // `<worker-name>.<account>.workers.dev` — so the first label is the name
    // wrangler deploys under.
    const deployed = JSON.parse(read("relay/wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "")) as { name: string };
    expect(host.split(".")[0], "the docs point at a Worker this repo does not deploy").toBe(deployed.name);
  });
  /**
   * The workspace key must never be committed, and this is where that gets
   * enforced rather than remembered.
   *
   * The repository is private today and may not stay that way, and git
   * keeps what it was given: a key pushed once stays readable in the
   * history after the file is "fixed". So the rule cannot be "delete it if
   * someone notices" — it has to fail before the commit.
   *
   * The realistic mistake is not malice, it is convenience: somebody gets
   * tired of telling colleagues the key and pastes their working URL into
   * the install page. That is the exact shape this looks for.
   */
  it("keeps the workspace key out of every file that gets committed", () => {
    const PLACEHOLDER = "KHOA-CONG-TY";
    for (const rel of ["README.md", "docs/COWORK.md", "docs/HUONG-DAN.md", "relay/wrangler.jsonc"]) {
      const body = read(rel);
      // The backtick matters: the troubleshooting table writes `?key=…` as
      // prose, and without excluding it the captured "value" is an ellipsis
      // plus a stray backtick, which fails as a leaked key. A guard that
      // cries wolf on its own documentation gets switched off within a week.
      for (const m of body.matchAll(/[?&]key=([^\s`"'&)<>]+)/g)) {
        const value = m[1]!;
        expect(
          value === PLACEHOLDER || value.startsWith("KHOA") || value === "…" || value.startsWith("<"),
          `${rel} looks like it carries a real key (key=${value.slice(0, 8)}…). The key is a Cloudflare ` +
            `secret — set it with "wrangler secret put WORKSPACE_KEY" — and the docs write ${PLACEHOLDER}.`,
        ).toBe(true);
      }
      expect(
        /WORKSPACE_KEY\s*[:=]\s*["'][^"']+["']/.test(body),
        `${rel} assigns WORKSPACE_KEY a literal value; that belongs in a wrangler secret, not in the repo`,
      ).toBe(false);
    }
  });
});
