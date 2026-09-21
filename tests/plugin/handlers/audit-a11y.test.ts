import { beforeEach, describe, expect, it, vi } from "vitest";
import { a11yAudit, responsiveAudit } from "../../../src/plugin/handlers/audit-a11y.js";
import { makeContext } from "../../../src/plugin/context.js";

type Fake = Record<string, any>;
const ctx = (params: Record<string, unknown>) => makeContext(params, () => {});

let nodes: Map<string, Fake>;

function reg(n: Fake): Fake {
  nodes.set(n.id, n);
  return n;
}

function solid(hex: string, a = 1): Fake {
  const h = hex.replace("#", "");
  return {
    type: "SOLID",
    visible: true,
    opacity: 1,
    color: {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
    },
    ...(a !== 1 ? { opacity: a } : {}),
  };
}

function node(id: string, type: string, extra: Fake = {}): Fake {
  const n: Fake = {
    id,
    type,
    name: id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    visible: true,
    opacity: 1,
    fills: [],
    strokes: [],
    effects: [],
    parent: null,
    children: [],
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    findAll(pred?: (n: Fake) => boolean) {
      const out: Fake[] = [];
      const walk = (p: Fake): void => {
        for (const c of p.children ?? []) {
          if (!pred || pred(c)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    },
    ...extra,
  };
  for (const c of n.children) c.parent = n;
  return reg(n);
}

beforeEach(() => {
  nodes = new Map();
  (globalThis as any).figma = {
    mixed: Symbol("mixed"),
    currentPage: { selection: [], type: "PAGE", children: [] },
    getNodeByIdAsync: vi.fn(async (id: string) => nodes.get(id) ?? null),
    loadAllPagesAsync: vi.fn(async () => {}),
  };
});

describe("a11y_audit", () => {
  it("measures the composited colour, not the raw fill", async () => {
    // #767676 on white is 4.54:1 and passes. The SAME grey at 60% opacity
    // composites to ~#b0b0b0, which is 2.3:1 and fails. Reading the raw fill
    // is how a 'secondary' text style passes an audit and fails a user.
    const text = node("t", "TEXT", {
      fills: [solid("#767676")],
      opacity: 0.6,
      fontSize: 16,
      characters: "Secondary",
    });
    const frame = node("f", "FRAME", { fills: [solid("#ffffff")], children: [text] });

    const res: any = await a11yAudit(ctx({ nodeId: frame.id }));
    const finding = res.findings.find((f: any) => f.rule === "contrast");
    expect(finding, "the 60%-opacity grey should fail").toBeTruthy();
    expect(finding.measured).toBeLessThan(4.5);
  });

  it("skips text with no filled ancestor instead of assuming white", async () => {
    // Assuming white manufactures findings on any component parked on the
    // bare canvas — which is where every component in a library sits.
    const text = node("t", "TEXT", { fills: [solid("#cccccc")], fontSize: 16, characters: "x" });
    const frame = node("f", "FRAME", { fills: [], children: [text] });

    const res: any = await a11yAudit(ctx({ nodeId: frame.id }));
    expect(res.findings.filter((f: any) => f.rule === "contrast")).toHaveLength(0);
    expect(res.skippedNoBackground).toBe(1);
    expect(res.note).toContain("no filled ancestor");
  });

  it("is certain about a node with reactions and unsure about one that just looks like a button", async () => {
    const real = node("r", "FRAME", { name: "Thing", width: 30, height: 30, reactions: [{}] });
    const guessed = node("g", "FRAME", { name: "Close button", width: 30, height: 30 });
    const root = node("root", "FRAME", { fills: [solid("#ffffff")], children: [real, guessed] });

    const res: any = await a11yAudit(ctx({ nodeId: root.id }));
    const byId = Object.fromEntries(res.findings.map((f: any) => [f.id, f]));
    expect(byId.r.severity).toBe("error");
    expect(byId.g.severity).toBe("warning");
    expect(byId.r.required).toBe(44);
  });
});

describe("responsive_audit", () => {
  it("names the constructions that cannot reflow", async () => {
    const wide = node("wide", "FRAME", { name: "Fixed card", width: 600, layoutGrow: 0, layoutAlign: "INHERIT", layoutMode: "NONE" });
    const root = node("root", "FRAME", { name: "Screen", width: 1440, layoutMode: "VERTICAL", children: [wide] });

    const res: any = await responsiveAudit(ctx({ nodeId: root.id, widths: [375] }));
    const rules = res.findings.map((f: any) => f.rule);
    expect(rules).toContain("fixed-too-wide");
    expect(res.mode).toBe("static");
  });

  it("flags a hugging text node inside a fixed parent", async () => {
    const text = node("t", "TEXT", {
      name: "Headline",
      width: 500,
      textAutoResize: "WIDTH_AND_HEIGHT",
      fontSize: 24,
      characters: "A long headline",
    });
    const root = node("root", "FRAME", {
      width: 600,
      layoutMode: "HORIZONTAL",
      counterAxisSizingMode: "FIXED",
      primaryAxisSizingMode: "FIXED",
      children: [text],
    });

    const res: any = await responsiveAudit(ctx({ nodeId: root.id, widths: [375] }));
    expect(res.findings.map((f: any) => f.rule)).toContain("text-will-not-wrap");
  });

  it("restores the frame even when the sweep throws", async () => {
    // The whole reason the restore is in a `finally`. A crash mid-sweep
    // otherwise leaves someone's 1440px artboard at 375px, with no undo
    // entry they would recognise as the cause.
    let calls = 0;
    const root = node("root", "FRAME", {
      width: 1440,
      height: 900,
      layoutMode: "NONE",
      resize(w: number, h: number) {
        calls++;
        // Blow up on the second resize — the first width measured fine.
        if (calls === 2) throw new Error("figma exploded mid-sweep");
        this.width = w;
        this.height = h;
      },
    });

    await expect(
      responsiveAudit(ctx({ nodeId: root.id, widths: [375, 768], simulate: true })),
    ).rejects.toThrow("figma exploded");
    expect(root.width, "frame was left resized").toBe(1440);
    expect(root.height).toBe(900);
  });

  it("restores the frame after a clean sweep too", async () => {
    const root = node("root", "FRAME", {
      width: 1440,
      height: 900,
      layoutMode: "NONE",
      resize(w: number, h: number) {
        this.width = w;
        this.height = h;
      },
    });
    const res: any = await responsiveAudit(
      ctx({ nodeId: root.id, widths: [375, 768], simulate: true }),
    );
    expect(root.width).toBe(1440);
    expect(res.simulation).toHaveLength(2);
    expect(res.verdict).toContain("restored");
  });
});
