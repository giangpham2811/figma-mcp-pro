import { beforeEach, describe, expect, it, vi } from "vitest";
import { surface, isFigJam, unsupportedInFigJam } from "../../src/plugin/surface.js";
import { boxesToFigJam, edgesToFigJam, splitEdgeId, shapeFor } from "../../src/plugin/figjam/adapt.js";
import { renderFigJam } from "../../src/plugin/figjam/render.js";
import { makeContext } from "../../src/plugin/context.js";

type Fake = Record<string, any>;
const ctx = (params: Record<string, unknown> = {}) => makeContext(params, () => {});

let created: Fake[];
let section: Fake;

function textSublayer(): Fake {
  return { characters: "", fontName: null, fontSize: 0, fills: [] };
}

function setEditor(kind: string): void {
  created = [];
  section = {
    type: "SECTION",
    id: "S:1",
    name: "",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fills: [],
    children: [] as Fake[],
    appendChild(n: Fake) {
      this.children.push(n);
      n.parent = this;
    },
    resizeWithoutConstraints(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
  };
  (globalThis as any).figma = {
    editorType: kind,
    currentPage: { appendChild: vi.fn(), selection: [] },
    loadFontAsync: vi.fn(async () => {}),
    getNodeByIdAsync: vi.fn(async (id: string) => (id === "S:1" ? section : null)),
    createSection: vi.fn(() => section),
    createText: vi.fn(() => {
      const n: Fake = { type: "TEXT", id: `T:${created.length}`, ...textSublayer(), x: 0, y: 0 };
      created.push(n);
      return n;
    }),
    createShapeWithText: vi.fn(() => {
      const n: Fake = {
        type: "SHAPE_WITH_TEXT",
        id: `SH:${created.length}`,
        name: "",
        shapeType: "",
        fills: [],
        strokes: [],
        strokeWeight: 0,
        text: textSublayer(),
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        resize(w: number, h: number) {
          this.width = w;
          this.height = h;
        },
      };
      created.push(n);
      return n;
    }),
    createConnector: vi.fn(() => {
      const n: Fake = {
        type: "CONNECTOR",
        id: `C:${created.length}`,
        name: "",
        strokes: [],
        text: textSublayer(),
        connectorStart: null,
        connectorEnd: null,
      };
      created.push(n);
      return n;
    }),
    createSticky: vi.fn(() => {
      const n: Fake = { type: "STICKY", id: `ST:${created.length}`, name: "", text: textSublayer(), x: 0, y: 0 };
      created.push(n);
      return n;
    }),
  };
}

beforeEach(() => setEditor("figjam"));

describe("surface detection", () => {
  it("reads the editor, and treats an unknown one as Design", () => {
    setEditor("figjam");
    expect(surface()).toBe("figjam");
    expect(isFigJam()).toBe(true);
    setEditor("figma");
    expect(isFigJam()).toBe(false);
    // An old runtime or a test mock with no editorType must keep every
    // existing Design path working — failing open towards FigJam would
    // break the surface that already ships.
    setEditor(undefined as unknown as string);
    expect(surface()).toBe("other");
    expect(isFigJam()).toBe(false);
  });
});

describe("the capability gate", () => {
  it("names the reason, not just the refusal", () => {
    const comp = unsupportedInFigJam("instantiate")!;
    expect(comp.message).toContain("no components");
    expect(comp.hint).toContain("Design file");

    const tok = unsupportedInFigJam("setup_tokens")!;
    expect(tok.message).toContain("no shared styles or variables");

    const proto = unsupportedInFigJam("build_demo")!;
    expect(proto.message).toContain("no prototype layer");

    const audit = unsupportedInFigJam("a11y_audit")!;
    // Not "unsupported" — it would technically compute, and that is exactly
    // why it is blocked. A board is not a shipped interface.
    expect(audit.message).toContain("not one");
  });

  it("refuses the one kind whose meaning does not survive the board", () => {
    // Not a capability gap — FigJam could draw the shapes. The vertical
    // axis is time, a connector binds to a node, and the result would look
    // like a sequence diagram while saying nothing.
    const seq = unsupportedInFigJam("create_sequence")!;
    expect(seq.message).toContain("TIME on the vertical axis");
    expect(seq.hint).toContain('type:"activity"');
  });

  it("lets every other diagram kind through", () => {
    for (const op of [
      "create_userflow",
      "create_activity",
      "create_erd",
      "create_state",
      "create_sitemap",
      "create_usecase",
      "create_journey",
      "create_persona",
      "create",
      "get_page_model",
      "get_diagram_spec",
    ]) {
      expect(unsupportedInFigJam(op), op).toBeNull();
    }
  });
});

describe("adapting Design draw-data", () => {
  it("keeps the flowchart vocabulary", () => {
    expect(shapeFor("decision")).toBe("DIAMOND");
    expect(shapeFor("initial")).toBe("ELLIPSE");
    expect(shapeFor("external")).toBe("PARALLELOGRAM_RIGHT");
    expect(shapeFor(undefined)).toBe("ROUNDED_RECTANGLE");
    // cls carries the meaning when kind does not.
    expect(shapeFor(undefined, "decision")).toBe("DIAMOND");
  });

  it("reads the two ENDS of an edge and throws the points away", () => {
    // The points are the router's output. Keeping them here would be
    // reimplementing the thing the connector exists to delete.
    expect(splitEdgeId("a->b")).toEqual({ from: "a", to: "b" });
    expect(splitEdgeId("no-arrow-here")).toBeNull();
    const links = edgesToFigJam([
      { id: "a->b", points: [[0, 0], [10, 10]], color: "#111111", dashed: true },
      { id: "nonsense", points: [], color: "#000000", dashed: false },
    ] as never);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ from: "a", to: "b", dashed: true });
    expect(links[0]).not.toHaveProperty("points");
  });

  it("can push detail onto a sticky instead of into the shape", () => {
    const [inShape] = boxesToFigJam([{ id: "p", at: { x: 0, y: 0, w: 10, h: 10 }, title: "T", detail: "D" }], {
      prefix: "page",
    });
    expect(inShape!.lines).toEqual(["T", "D"]);
    expect(inShape!.note).toBeUndefined();

    const [onSticky] = boxesToFigJam([{ id: "p", at: { x: 0, y: 0, w: 10, h: 10 }, title: "T", detail: "D" }], {
      prefix: "page",
      detailAsNote: true,
    });
    expect(onSticky!.lines).toEqual(["T"]);
    expect(onSticky!.note).toEqual(["D"]);
  });
});

describe("renderFigJam", () => {
  const frame = { name: "Sec", title: "Title", x: 5, y: 7, w: 400, h: 300 };

  it("binds connectors to NODE IDS, not coordinates", async () => {
    const res = await renderFigJam(
      ctx(),
      frame,
      [
        { id: "a", name: "n:a", at: { x: 0, y: 0, w: 100, h: 60 }, lines: ["A"] },
        { id: "b", name: "n:b", at: { x: 200, y: 0, w: 100, h: 60 }, lines: ["B"] },
      ],
      [{ id: "a->b", from: "a", to: "b", label: "yes" }],
      "Inter",
    );
    const connector = created.find((n) => n.type === "CONNECTOR")!;
    // This is the whole reason FigJam is worth supporting: the endpoint is a
    // node, so dragging the box takes the line with it and no router runs.
    expect(connector.connectorStart).toEqual({ endpointNodeId: res.nodes.a, magnet: "AUTO" });
    expect(connector.connectorEnd).toEqual({ endpointNodeId: res.nodes.b, magnet: "AUTO" });
    expect(connector.text.characters).toBe("yes");
    expect(res.surface).toBe("figjam");
  });

  it("drops the arrow head when the relation is not directed", async () => {
    await renderFigJam(
      ctx(),
      frame,
      [
        { id: "a", name: "a", at: { x: 0, y: 0, w: 10, h: 10 }, lines: ["A"] },
        { id: "b", name: "b", at: { x: 0, y: 0, w: 10, h: 10 }, lines: ["B"] },
      ],
      [{ id: "a->b", from: "a", to: "b", arrow: false }],
      "Inter",
    );
    expect(created.find((n) => n.type === "CONNECTOR")!.connectorEndStrokeCap).toBe("NONE");
  });

  it("warns instead of throwing when a link names a box that is not there", async () => {
    const c = ctx();
    await renderFigJam(
      c,
      frame,
      [{ id: "a", name: "a", at: { x: 0, y: 0, w: 10, h: 10 }, lines: ["A"] }],
      [{ id: "a->ghost", from: "a", to: "ghost" }],
      "Inter",
    );
    expect(c.warnings.join(" ")).toContain("was not drawn");
    expect(created.some((n) => n.type === "CONNECTOR")).toBe(false);
  });

  it("empties a section it is redrawing into, and keeps its id", async () => {
    section.children = [{ id: "old", removed: false, remove() { this.removed = true; } }];
    const stale = section.children[0];
    const res = await renderFigJam(ctx(), frame, [], [], "Inter", "S:1");
    expect(stale.removed).toBe(true);
    expect(res.frameId).toBe("S:1");
    expect((globalThis as any).figma.createSection).not.toHaveBeenCalled();
  });

  it("refuses a redraw target that is not a section", async () => {
    await expect(renderFigJam(ctx(), frame, [], [], "Inter", "nope")).rejects.toThrow(/not a section/);
  });

  it("falls back to Inter and says so when the asked-for font is missing", async () => {
    const c = ctx();
    (globalThis as any).figma.loadFontAsync = vi.fn(async (f: { family: string }) => {
      if (f.family !== "Inter") throw new Error("no such font");
    });
    await renderFigJam(c, frame, [{ id: "a", name: "a", at: { x: 0, y: 0, w: 10, h: 10 }, lines: ["A"] }], [], "Comic Sans MS");
    // A shape whose font never loaded renders BLANK with no error, which is
    // the failure this catches.
    expect(c.warnings.join(" ")).toContain("not available on this board");
  });
});

describe("boxes that carry their coordinates flat", () => {
  /**
   * userflow is the odd one out and always has been: its DrawBox and
   * DrawDiamond hold x/y/w/h directly, while activity, erd, state and
   * sitemap nest them under `at`. The adapter read `at` and the call sites
   * hid the mismatch behind `as never`, so nothing complained until a real
   * board tried to draw one and got "Cannot read properties of undefined
   * (reading 'w')" — after the request had already crossed the network,
   * which is the most expensive possible place to learn about a type.
   */
  it("reads a flat box the same as a nested one", () => {
    const flat = boxesToFigJam([{ id: "pay", title: "Thanh toán", x: 10, y: 20, w: 200, h: 90 }], {
      prefix: "screen",
    });
    expect(flat[0]!.at).toEqual({ x: 10, y: 20, w: 200, h: 90 });

    const nested = boxesToFigJam([{ id: "pay", title: "Thanh toán", at: { x: 10, y: 20, w: 200, h: 90 } }], {
      prefix: "screen",
    });
    expect(nested[0]!.at).toEqual(flat[0]!.at);
  });

  it("never hands the renderer an undefined placement", () => {
    // render.ts does box.at.w unguarded, so a missing `at` is a crash, not
    // a misplaced shape.
    const [only] = boxesToFigJam([{ id: "x" }], { prefix: "screen" });
    expect(only!.at).toBeDefined();
    expect(Number.isFinite(only!.at.w)).toBe(true);
  });
});
