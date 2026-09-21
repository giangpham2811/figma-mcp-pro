import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDemo,
  playDemo,
  listDemos,
  getDemoSpec,
  deleteDemo,
} from "../../../src/plugin/handlers/demo.js";
import { makeContext } from "../../../src/plugin/context.js";
import { HandlerError } from "../../../src/plugin/errors.js";
import { ErrorCode } from "../../../src/shared/protocol.js";

type Fake = Record<string, any>;
const ctx = (params: Record<string, unknown>) => makeContext(params, () => {});
const fail = (p: Promise<unknown>) => p.catch((e) => e) as Promise<HandlerError>;

let nodes: Map<string, Fake>;
let store: Record<string, string>;
let page: Fake;

function frame(id: string, name: string): Fake {
  const f: Fake = {
    id,
    name,
    type: "FRAME",
    reactions: [],
    setReactionsAsync: vi.fn(async (r: unknown) => {
      f.reactions = r;
    }),
    exportAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  nodes.set(id, f);
  return f;
}

beforeEach(() => {
  nodes = new Map();
  store = {};
  page = { type: "PAGE", children: [], selection: [], flowStartingPoints: [] };
  (globalThis as any).figma = {
    root: {
      getPluginData: (k: string) => store[k] ?? "",
      setPluginData: (k: string, v: string) => {
        store[k] = v;
      },
    },
    currentPage: page,
    viewport: { scrollAndZoomIntoView: vi.fn() },
    getNodeByIdAsync: vi.fn(async (id: string) => nodes.get(id) ?? null),
    loadAllPagesAsync: vi.fn(async () => {}),
  };
});

function seedThreeFrames(): [Fake, Fake, Fake] {
  const a = frame("1:1", "Home");
  const b = frame("1:2", "Details");
  const c = frame("1:3", "Done");
  page.children = [a, b, c];
  return [a, b, c];
}

describe("build_demo", () => {
  it("wires each frame to the next and registers a starting point", async () => {
    const [a, b, c] = seedThreeFrames();
    const res: any = await buildDemo(
      ctx({ name: "Checkout", steps: [{ frame: "Home" }, { frame: "Details" }, { frame: "Done" }] }),
    );

    expect(res.steps).toBe(3);
    expect(a.reactions[0].actions[0].destinationId).toBe(b.id);
    expect(b.reactions[0].actions[0].destinationId).toBe(c!.id);
    // The last frame is a destination, never a source.
    expect(c.reactions).toEqual([]);
    // Without a starting point Figma presents from the top-left frame on the
    // page, which is almost never step 1.
    expect(page.flowStartingPoints).toEqual([{ nodeId: a.id, name: "Checkout" }]);
  });

  it("refuses a one-step demo", async () => {
    seedThreeFrames();
    const e = await fail(buildDemo(ctx({ name: "x", steps: [{ frame: "Home" }] })));
    expect(e.message).toContain("at least two steps");
  });

  it("will not overwrite a demo without being told to", async () => {
    seedThreeFrames();
    const steps = [{ frame: "Home" }, { frame: "Details" }];
    await buildDemo(ctx({ name: "Checkout", steps }));
    const e = await fail(buildDemo(ctx({ name: "Checkout", steps })));
    expect(e.code).toBe(ErrorCode.CONFIRM_REQUIRED);
    await expect(buildDemo(ctx({ name: "Checkout", steps, overwrite: true }))).resolves.toBeTruthy();
  });
});

describe("the store", () => {
  it("survives on the document, so a demo outlives the session", async () => {
    seedThreeFrames();
    await buildDemo(ctx({ name: "Checkout", steps: [{ frame: "Home" }, { frame: "Details" }] }));
    // Everything the handlers know is in document plugin data — nothing is
    // held in a module-level variable that a plugin reload would lose.
    const res: any = await listDemos(ctx({}));
    expect(res.count).toBe(1);
    expect(res.demos[0].frames).toEqual(["Home", "Details"]);
  });

  it("reports a corrupt store instead of silently resetting it", async () => {
    store["reqwise:demos"] = "{not json";
    const e = await fail(listDemos(ctx({})));
    expect(e.code).toBe(ErrorCode.INTERNAL);
    expect(e.hint).toContain("force: true");
  });

  it("names frames that have been deleted since", async () => {
    const [, b] = seedThreeFrames();
    await buildDemo(ctx({ name: "Checkout", steps: [{ frame: "Home" }, { frame: "Details" }] }));
    nodes.delete(b.id);

    const res: any = await getDemoSpec(ctx({ name: "Checkout" }));
    expect(res.missingFrames).toEqual(["Details"]);
    expect(res.warning).toContain("no longer exist");
  });
});

describe("delete_demo", () => {
  it("leaves the prototype reactions alone by default", async () => {
    const [a] = seedThreeFrames();
    await buildDemo(ctx({ name: "Checkout", steps: [{ frame: "Home" }, { frame: "Details" }] }));

    const res: any = await deleteDemo(ctx({ name: "Checkout" }));
    // Deleting a bookkeeping entry must not silently strip links a designer
    // may have edited since the demo was built.
    expect(a.reactions).toHaveLength(1);
    expect(res.unwired).toBe(0);
    expect(res.note).toContain("left in place");
  });

  it("removes them when asked", async () => {
    const [a] = seedThreeFrames();
    await buildDemo(ctx({ name: "Checkout", steps: [{ frame: "Home" }, { frame: "Details" }] }));
    const res: any = await deleteDemo(ctx({ name: "Checkout", unwire: true }));
    expect(a.reactions).toEqual([]);
    expect(res.unwired).toBe(1);
  });

  it("needs force for a wipe", async () => {
    seedThreeFrames();
    await buildDemo(ctx({ name: "Checkout", steps: [{ frame: "Home" }, { frame: "Details" }] }));
    const e = await fail(deleteDemo(ctx({ all: true })));
    expect(e.code).toBe(ErrorCode.CONFIRM_REQUIRED);
  });
});

describe("play_demo", () => {
  it("skips a deleted frame with a warning instead of throwing", async () => {
    const [, b] = seedThreeFrames();
    await buildDemo(
      ctx({ name: "Checkout", steps: [{ frame: "Home" }, { frame: "Details" }, { frame: "Done" }], holdMs: 200 }),
    );
    nodes.delete(b.id);

    const c = ctx({ name: "Checkout", speed: 100 });
    const res: any = await playDemo(c);
    expect(res.skipped).toBe(1);
    expect(c.warnings.join(" ")).toContain("no longer exists");
    expect(res.steps).toBe(3);
  });

  it("captures one image per step only when asked", async () => {
    const [a] = seedThreeFrames();
    await buildDemo(ctx({ name: "Checkout", steps: [{ frame: "Home" }, { frame: "Details" }], holdMs: 200 }));

    const plain: any = await playDemo(ctx({ name: "Checkout", speed: 100 }));
    expect(plain.played.every((s: any) => s.png === undefined)).toBe(true);
    expect(a.exportAsync).not.toHaveBeenCalled();

    const shot: any = await playDemo(ctx({ name: "Checkout", speed: 100, capture: true }));
    expect(shot.played[0].png).toBeTruthy();
    expect(shot.note).toContain("cannot record video");
  });
});
