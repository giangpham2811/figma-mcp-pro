import { describe, expect, it } from "vitest";
import { TOOLS } from "../../src/server/index.js";

/**
 * What each tool DECLARES has to match what its handler actually does.
 *
 * `update`/`patch` were once added to the wrong tool: both schemas carry an
 * identical `y: { type: "number", … }` line, the edit anchored on the first
 * one, and the block landed on `figma_userflow`. Nothing failed — the feature
 * worked when called, because the handler reads the field regardless of the
 * schema. It was simply undiscoverable on the tool that had it, and advertised
 * on the tool that did not. Pinning the property lists is what makes that kind
 * of drift loud instead of silent.
 */
const props = (name: string) => {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return Object.keys((tool.inputSchema as { properties: object }).properties).sort();
};

describe("the declared shape of each tool", () => {
  it("figma_diagram is the one that can change a drawing", () => {
    expect(props("figma_diagram")).toEqual([
      "actors", "channel", "diagrams", "edges", "entities", "file", "fragments", "gap", "lanes", "mermaid",
      "messages", "nodes", "options", "page", "pages", "parentId", "participants", "patch", "persona",
      "personas", "place", "relations", "stages", "states", "subtitle", "text", "title", "transitions",
      "type", "update", "useCases", "x", "y",
    ]);
  });

  it("draws all nine kinds, userflow included", () => {
    const t = TOOLS.find((x) => x.name === "figma_diagram")!;
    const type = (t.inputSchema as any).properties.type;
    expect(type.enum).toEqual([
      "activity",
      "erd",
      "journey",
      "persona",
      "sequence",
      "sitemap",
      "state",
      "usecase",
      "userflow",
    ]);
    // figma_userflow was folded in: one tool description instead of two, and
    // the second one was 4,314 bytes every session for a kind most sessions
    // never draw.
    expect(TOOLS.map((x) => x.name)).not.toContain("figma_userflow");
  });

  it("still DECLARES every per-kind array, so the array form stays callable", () => {
    // The descriptions moved to figma_docs; the properties did not. Dropping
    // them while `additionalProperties` stays false is what would make the
    // array form silently unusable — the exact failure c586334 warned about.
    const t = TOOLS.find((x) => x.name === "figma_diagram")!;
    const schema = t.inputSchema as any;
    expect(schema.additionalProperties).toBe(false);
    for (const k of ["participants", "messages", "fragments", "entities", "relations",
                     "states", "transitions", "lanes", "nodes", "edges", "pages",
                     // Added with usecase/journey/persona. Live Figma found
                     // these missing before any test did: the compact `text`
                     // form worked and the array form came back
                     // INVALID_PARAMS, because additionalProperties is false
                     // and an undeclared key is simply dropped.
                     "personas", "stages", "actors", "useCases"]) {
      expect(schema.properties[k], k).toBeTruthy();
    }
  });

  it("declares every option the handler reads", () => {
    // `options` is a strict object, so an option the handler honours but the
    // schema omits is rejected before it ever reaches the handler — and the
    // unit tests, which call the handler directly, never notice. That is how
    // `crossCheck` shipped undeclared, and how `update`/`patch` landed on the
    // wrong tool.
    const t = TOOLS.find((x) => x.name === "figma_diagram")!;
    const opts = Object.keys((t.inputSchema as any).properties.options.properties).sort();
    expect(opts).toEqual([
      "checkFirst", "colorByTarget", "crossCheck", "dryRun", "font", "layout",
      "linkScreens", "liveRoute", "maxDepth", "policies", "rankdir", "verify",
    ]);
  });

  it("every tool has a description and an object schema", () => {
    for (const t of TOOLS) {
      expect(t.description, t.name).toBeTruthy();
      expect((t.inputSchema as { type: string }).type, t.name).toBe("object");
    }
  });
});

/**
 * The fixed cost of loading this server, paid in every session before the user
 * has typed anything. A single-diagram session pays it in full, so it is worth
 * a number that fails when it grows by accident rather than by decision.
 */
describe("what the tool list costs to load", () => {
  it("stays within the budget the token diet set", () => {
    const bytes = JSON.stringify(TOOLS).length;
    // The free edition's six tools and six diagram kinds. 18,425B after
    // file/page routing: agents were stuck asking the user to click Connect
    // whenever two Figma windows were open. Raise this deliberately, with the
    // reason in the commit message — never to make a red test green.
    //
    // 19,900B: usecase, journey and persona, and the four arrays they call
    // with. The enum entries were ~72B each; the arrays are the rest, and
    // they are NOT optional — additionalProperties is false, so an array
    // that is not declared here is silently dropped and the call comes back
    // INVALID_PARAMS. Live Figma found that before any test did. The
    // descriptions were cut back to the field list once that was fixed; the
    // teaching lives in figma_docs and the skills, loaded on demand.
    expect(bytes).toBeLessThan(19_900);
  });
});
