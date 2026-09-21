import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findOrCreateComponent,
  instantiate,
  createVariants,
  addComponentProperty,
  arrangeComponentSet,
} from "../../../src/plugin/handlers/components.js";
import {
  setInstanceOverrides,
  matchMainValues,
  exposeNestedInstance,
  detachInstance,
} from "../../../src/plugin/handlers/instance-overrides.js";
import { makeContext } from "../../../src/plugin/context.js";
import { HandlerError } from "../../../src/plugin/errors.js";

/**
 * These assert the thing the bug would touch.
 *
 * Two of them exist because the obvious assertion would not have bitten. The
 * variant-ordering test asserts the ARGUMENTS OF EACH setProperties CALL, not
 * the returned node — a handler that sends everything in one call returns the
 * same shape and passes any test that only reads the result. The read-back
 * test makes a mock that accepts a write and keeps the old value, which is
 * exactly what Figma does for a variant combination that does not exist; a
 * handler that trusts setProperties reports success there and the caller goes
 * looking for its own bug.
 */

type Fake = Record<string, any>;
const ctx = (params: Record<string, unknown>) => makeContext(params, () => {});
const fail = (p: Promise<unknown>) => p.catch((e) => e) as Promise<HandlerError>;

let nodes: Map<string, Fake>;
let currentPage: Fake;

function register(node: Fake): Fake {
  nodes.set(node.id, node);
  return node;
}

/** A node with enough surface for serializeNode to walk it. */
function baseNode(id: string, type: string, name: string): Fake {
  return {
    id,
    name,
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    visible: true,
    opacity: 1,
    rotation: 0,
    locked: false,
    fills: [],
    strokes: [],
    effects: [],
    parent: null,
    children: [],
    remove: vi.fn(),
    resizeWithoutConstraints: vi.fn(function (this: Fake, w: number, h: number) {
      this.width = w;
      this.height = h;
    }),
    findAll: vi.fn(function (this: Fake) {
      const out: Fake[] = [];
      const walk = (n: Fake) => {
        for (const c of n.children ?? []) {
          out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }),
  };
}

function component(id: string, name: string, extra: Fake = {}): Fake {
  const c = baseNode(id, "COMPONENT", name);
  c.key = `key-${id}`;
  c.componentPropertyDefinitions = {};
  c.description = "";
  c.addComponentProperty = vi.fn((n: string, t: string, d: unknown) => {
    const key = t === "VARIANT" ? n : `${n}#1:${Object.keys(c.componentPropertyDefinitions).length}`;
    c.componentPropertyDefinitions[key] = { type: t, defaultValue: d };
    return key;
  });
  Object.assign(c, extra);
  return register(c);
}

function page(): Fake {
  const pg = baseNode("0:1", "PAGE", "Page 1");
  pg.insertChild = vi.fn((i: number, n: Fake) => {
    pg.children.splice(i, 0, n);
    n.parent = pg;
  });
  pg.appendChild = vi.fn((n: Fake) => {
    pg.children.push(n);
    n.parent = pg;
  });
  return pg;
}

beforeEach(() => {
  nodes = new Map();
  currentPage = page();
  register(currentPage);
  (globalThis as any).figma = {
    root: {
      children: [currentPage],
      findAll: (pred: (n: Fake) => boolean) => [...nodes.values()].filter(pred),
      findOne: (pred: (n: Fake) => boolean) =>
        [...nodes.values()].find(pred) ?? null,
    },
    currentPage,
    mixed: Symbol("mixed"),
    loadAllPagesAsync: vi.fn(async () => {}),
    loadFontAsync: vi.fn(async () => {}),
    getNodeByIdAsync: vi.fn(async (id: string) => nodes.get(id) ?? null),
    createFrame: vi.fn(() => register(baseNode(`N:${nodes.size}`, "FRAME", "Frame"))),
    createText: vi.fn(() => register(baseNode(`N:${nodes.size}`, "TEXT", "Text"))),
    createRectangle: vi.fn(() => register(baseNode(`N:${nodes.size}`, "RECTANGLE", "Rect"))),
    createComponentFromNode: vi.fn((n: Fake) => {
      const c = component(`C:${n.id}`, n.name);
      c.parent = n.parent;
      return c;
    }),
    combineAsVariants: vi.fn((kids: Fake[], parent: Fake) => {
      const set = baseNode("SET:1", "COMPONENT_SET", "Set");
      set.key = "key-set";
      set.children = kids;
      set.componentPropertyDefinitions = {};
      set.variantGroupProperties = {};
      set.description = "";
      // Figma hands back a corner radius nobody asked for.
      set.cornerRadius = 5;
      set.parent = parent;
      for (const k of kids) k.parent = set;
      return register(set);
    }),
  };
});

// ---------------------------------------------------------------------------

describe("instantiate", () => {
  /** An instance whose setProperties records every call it receives. */
  function instanceOf(main: Fake, props: Record<string, Fake>): Fake {
    const inst = baseNode(`I:${main.id}`, "INSTANCE", main.name);
    inst.componentProperties = props;
    inst.calls = [] as Array<Record<string, unknown>>;
    inst.setProperties = vi.fn((patch: Record<string, unknown>) => {
      inst.calls.push({ ...patch });
      for (const [k, v] of Object.entries(patch)) {
        if (inst.componentProperties[k]) inst.componentProperties[k].value = v;
      }
    });
    inst.getMainComponentAsync = async () => main;
    inst.overrides = [];
    inst.exposedInstances = [];
    return register(inst);
  }

  it("applies VARIANT properties in their own call, before everything else", async () => {
    const main = component("1:1", "Button");
    const inst = instanceOf(main, {
      Size: { type: "VARIANT", value: "Small" },
      "Label#1:0": { type: "TEXT", value: "Click" },
    });
    main.createInstance = () => inst;

    await instantiate(
      ctx({ componentId: "1:1", props: { Size: "Large", Label: "Buy now" } }),
    );

    // Two calls, in this order. One call would have lost the label: switching
    // a variant re-reads the instance off a different main component.
    expect(inst.calls).toEqual([{ Size: "Large" }, { "Label#1:0": "Buy now" }]);
  });

  it("reports a property Figma accepted but did not keep as failed, not applied", async () => {
    const main = component("1:1", "Button");
    const inst = instanceOf(main, { Size: { type: "VARIANT", value: "Small" } });
    // The combination does not exist: the write is swallowed, the old value
    // stays, and nothing throws. This is live Figma behaviour, not a strawman.
    inst.setProperties = vi.fn((patch: Record<string, unknown>) => {
      inst.calls.push({ ...patch });
    });
    inst.calls = [];
    main.createInstance = () => inst;

    const res: any = await instantiate(
      ctx({ componentId: "1:1", props: { Size: "Enormous" } }),
    );
    // Applied through the variant path, so the read-back guard is the only
    // thing standing between the caller and a false success.
    expect(res.instances[0].properties.applied).not.toContain("Size");
  });

  it("hands back the available property keys so a wrong name is fixable", async () => {
    const main = component("1:1", "Button", {
      componentPropertyDefinitions: { "Label#1:0": { type: "TEXT" } },
    });
    const inst = instanceOf(main, {});
    main.createInstance = () => inst;
    const res: any = await instantiate(ctx({ componentId: "1:1" }));
    expect(res.availableProperties).toEqual(["Label#1:0"]);
  });
});

describe("findOrCreateComponent", () => {
  it("does not treat a substring match as an existing component", async () => {
    component("1:1", "Button Group");
    const res: any = await findOrCreateComponent(
      ctx({ query: "Button", spec: { type: "FRAME", name: "Button" } }),
    );
    // "Button Group" contains "Button" and scores 600. Reusing it here is how
    // a design system ends up with a Button that is secretly a Button Group.
    expect(res.created).toBe(true);
  });

  it("returns the existing component untouched on an exact match", async () => {
    const existing = component("1:1", "Button");
    const res: any = await findOrCreateComponent(
      ctx({ query: "Button", spec: { type: "FRAME" } }),
    );
    expect(res.created).toBe(false);
    expect(res.component.id).toBe(existing.id);
    expect((globalThis as any).figma.createComponentFromNode).not.toHaveBeenCalled();
  });
});

describe("createVariants", () => {
  it("refuses the whole call rather than combining the legal subset", async () => {
    component("1:1", "Size=Small");
    register(baseNode("1:2", "FRAME", "not a component"));

    const e = await fail(createVariants(ctx({ nodeIds: ["1:1", "1:2"] })));
    expect(e).toBeInstanceOf(HandlerError);
    expect(e.message).toContain("is a FRAME, not a COMPONENT");
    // combineAsVariants moves nodes and re-links instances; a partial combine
    // is not something the caller can undo from here.
    expect((globalThis as any).figma.combineAsVariants).not.toHaveBeenCalled();
  });

  it("clears the corner radius combineAsVariants invents", async () => {
    component("1:1", "Size=Small");
    component("1:2", "Size=Large");
    const res: any = await createVariants(ctx({ nodeIds: ["1:1", "1:2"] }));
    expect(nodes.get(res.id)!.cornerRadius).toBe(0);
  });

  it("warns when a component has no Property=Value name", async () => {
    component("1:1", "Small");
    component("1:2", "Large");
    const c = ctx({ nodeIds: ["1:1", "1:2"] });
    await createVariants(c);
    expect(c.warnings.join(" ")).toContain("Figma will invent a property name");
  });
});

describe("addComponentProperty", () => {
  it("explains why a lone component cannot hold a VARIANT property", async () => {
    component("1:1", "Button");
    const e = await fail(
      addComponentProperty(ctx({ nodeId: "1:1", name: "Size", type: "VARIANT" })),
    );
    expect(e.message).toContain("not part of a component set");
    expect(e.hint).toContain("create_variants");
  });

  it("returns the suffixed key, which is what setProperties needs", async () => {
    component("1:1", "Button");
    const res: any = await addComponentProperty(
      ctx({ nodeId: "1:1", name: "Label", type: "TEXT", defaultValue: "Hi" }),
    );
    expect(res.key).toBe("Label#1:0");
  });
});

describe("arrangeComponentSet", () => {
  it("sizes cells to the largest variant so rows stay aligned", async () => {
    const a = component("1:1", "Size=Small");
    const b = component("1:2", "Size=Large");
    b.width = 300;
    b.height = 80;
    const set = (globalThis as any).figma.combineAsVariants([a, b], currentPage);

    await arrangeComponentSet(ctx({ nodeId: set.id, columns: 2, gap: 10, padding: 10 }));
    expect(a.x).toBe(10);
    expect(b.x).toBe(10 + 300 + 10);
    expect(set.width).toBe(10 * 2 + 300 * 2 + 10);
  });
});

describe("instance overrides", () => {
  function instance(id: string, main: Fake, overrides: Fake[] = []): Fake {
    const inst = baseNode(id, "INSTANCE", main.name);
    inst.componentProperties = {};
    inst.overrides = overrides;
    inst.exposedInstances = [];
    inst.getMainComponentAsync = async () => main;
    inst.setProperties = vi.fn();
    inst.resetOverrides = vi.fn(() => {
      inst.overrides = [];
    });
    inst.detachInstance = vi.fn(() => {
      const f = baseNode(`F:${id}`, "FRAME", inst.name);
      return register(f);
    });
    return register(inst);
  }

  it("skips a target built from a different main component", async () => {
    const mainA = component("1:1", "Button");
    const mainB = component("1:2", "Card");
    instance("I:1", mainA);
    instance("I:2", mainB);

    const res: any = await setInstanceOverrides(
      ctx({ nodeIds: ["I:2"], sourceInstanceId: "I:1" }),
    );
    // Property keys are per-component; a half-applied diff across two
    // components produces a file nobody can reason about later.
    expect(res.applied).toBe(0);
    expect(res.results[0].error).toContain("different component");
  });

  it("match_main_values reports drift without touching anything by default", async () => {
    const main = component("1:1", "Button");
    const label = register(baseNode("L:1", "TEXT", "Label"));
    const inst = instance("I:1", main, [
      { id: label.id, overriddenFields: ["characters"] },
    ]);

    const res: any = await matchMainValues(ctx({ nodeId: "I:1" }));
    expect(res.driftedLayers).toBe(1);
    expect(res.applied).toBe(false);
    expect(inst.resetOverrides).not.toHaveBeenCalled();
  });

  it("match_main_values names what it could not revert", async () => {
    const main = component("1:1", "Button");
    const label = register(baseNode("L:1", "TEXT", "Label"));
    const inst = instance("I:1", main, [
      { id: label.id, overriddenFields: ["characters"] },
    ]);
    // A plain TEXT layer keeps its override after the instance-level reset;
    // resetOverrides() exists on an INSTANCE and nowhere else.
    inst.resetOverrides = vi.fn();

    const res: any = await matchMainValues(ctx({ nodeId: "I:1", apply: true }));
    expect(res.unresettable).toEqual(["Label"]);
  });

  it("refuses to expose a placed instance, where the flag does nothing", async () => {
    const main = component("1:1", "Button");
    const inst = instance("I:1", main);
    inst.parent = currentPage;

    const e = await fail(exposeNestedInstance(ctx({ nodeId: "I:1" })));
    expect(e.message).toContain("not nested inside a main component");
  });

  it("reports the id change on detach", async () => {
    const main = component("1:1", "Button");
    instance("I:1", main);
    const res: any = await detachInstance(ctx({ nodeId: "I:1" }));
    // A caller holding the instance id is holding a dead reference from here.
    expect(res.previousId).toBe("I:1");
    expect(res.id).not.toBe("I:1");
  });
});
