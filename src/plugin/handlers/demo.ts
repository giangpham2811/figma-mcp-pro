/// <reference types="@figma/plugin-typings" />
/**
 * Self-playing demos: build_demo, play_demo, list_demos, get_demo_spec,
 * delete_demo.
 *
 * What this is, stated plainly, because the feature name oversells what any
 * Figma plugin can do: **a plugin cannot record video.** There is no screen
 * capture in the Plugin API and there never has been. What a plugin CAN do is
 * (a) wire the prototype so the flow is clickable in Figma's own presenter,
 * and (b) drive the canvas itself — move the viewport frame to frame on a
 * timer, so a demo plays in front of whoever is watching the screen.
 *
 * So that is what this does, and `play_demo` optionally exports one PNG per
 * step for assembling a GIF or an MP4 with a tool that actually encodes
 * video. Anything claiming a plugin records video is either screen-recording
 * outside Figma or stitching exactly these frames.
 *
 * A demo is stored on the document, not in a session: the point of naming one
 * is that it is still there next week, in somebody else's Figma window.
 */
import { HandlerContext, requireNode, findNode } from "../context.js";
import { err } from "../errors.js";
import { ErrorCode } from "../../shared/protocol.js";
import { encodeBase64 } from "../base64.js";

/** Document plugin-data key holding every demo in the file. */
const DEMOS_KEY = "reqwise:demos";

export interface DemoStep {
  frameId: string;
  /** Resolved at build time so a listing reads without touching the canvas. */
  frameName: string;
  label?: string;
  /** Milliseconds to hold on this step when playing. */
  holdMs: number;
  /** The node the reaction was wired on — usually the frame itself. */
  hotspotId?: string;
}

export interface Demo {
  name: string;
  description?: string;
  steps: DemoStep[];
  createdAt: number;
  /** Nodes whose reactions this demo wrote, so delete can offer to undo. */
  wiredNodeIds: string[];
}

function readAll(): Record<string, Demo> {
  const raw = figma.root.getPluginData(DEMOS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Demo>) : {};
  } catch {
    // Corrupt data is reported by the caller rather than silently reset —
    // wiping somebody's demos because one byte went wrong is not a recovery.
    throw err(
      ErrorCode.INTERNAL,
      "The demo store on this document is not valid JSON.",
      "delete_demo with { all: true, force: true } clears it; anything else risks writing over data that might still be recoverable by hand.",
    );
  }
}

function writeAll(demos: Record<string, Demo>): void {
  figma.root.setPluginData(DEMOS_KEY, JSON.stringify(demos));
}

/** Resolve a step's frame from an id or a name. */
async function resolveFrame(step: unknown, index: number): Promise<SceneNode> {
  const s = (typeof step === "string" ? { frame: step } : step) as Record<string, unknown>;
  const id = s.frameId ?? s.id;
  if (typeof id === "string" && id) {
    const node = await findNode(id);
    if (node && node.type !== "PAGE" && node.type !== "DOCUMENT") return node as SceneNode;
  }
  const name = s.frame ?? s.name;
  if (typeof name === "string" && name) {
    const match = figma.currentPage.children.find((c) => c.name === name);
    if (match) return match;
  }
  throw err(
    ErrorCode.NODE_NOT_FOUND,
    `Step ${index + 1} names no frame that exists on this page.`,
    'Each step is { frameId } or { frame: "Frame name" }; names are matched against top-level frames of the current page.',
  );
}

/**
 * build_demo — wire a click-through and remember it by name.
 *
 * The reactions are real Figma prototype reactions, so the flow works in
 * Figma's presenter with no plugin running. That is the difference between a
 * demo and an animation: somebody else can open the file and click it.
 */
export async function buildDemo(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const name = String(p.name ?? "").trim();
  if (!name) {
    throw err(ErrorCode.INVALID_PARAMS, "build_demo requires a name.");
  }
  const rawSteps = Array.isArray(p.steps) ? p.steps : [];
  if (rawSteps.length < 2) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      "A demo needs at least two steps.",
      'steps: [{ frame: "Home" }, { frame: "Details" }] — one frame is a screenshot, not a demo.',
    );
  }

  const demos = readAll();
  if (demos[name] && p.overwrite !== true) {
    throw err(
      ErrorCode.CONFIRM_REQUIRED,
      `A demo called "${name}" already exists (${demos[name]!.steps.length} steps).`,
      "Pass overwrite: true to replace it, or pick another name. Replacing rewires the reactions.",
    );
  }

  const defaultHold = typeof p.holdMs === "number" ? Math.max(200, p.holdMs) : 1600;
  const steps: DemoStep[] = [];
  const frames: SceneNode[] = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const frame = await resolveFrame(rawSteps[i], i);
    const s = (typeof rawSteps[i] === "string" ? {} : rawSteps[i]) as Record<string, unknown>;
    frames.push(frame);
    steps.push({
      frameId: frame.id,
      frameName: frame.name,
      ...(typeof s.label === "string" ? { label: s.label } : {}),
      holdMs: typeof s.holdMs === "number" ? Math.max(200, s.holdMs) : defaultHold,
    });
  }

  // Wire frame N → frame N+1. The hotspot is the whole frame unless the step
  // names one, because a demo that needs the viewer to find a 40px button is
  // a demo that stalls in front of an audience.
  const wired: string[] = [];
  const transition = typeof p.transition === "string" ? p.transition : "SMART_ANIMATE";
  const duration = typeof p.durationMs === "number" ? p.durationMs / 1000 : 0.3;

  for (let i = 0; i < frames.length - 1; i++) {
    const from = frames[i]!;
    const to = frames[i + 1]!;
    const hotspotRaw = (rawSteps[i] as Record<string, unknown> | undefined)?.hotspotId;
    const hotspot =
      typeof hotspotRaw === "string" ? await requireNode(hotspotRaw) : from;

    if (!("reactions" in hotspot)) {
      throw err(
        ErrorCode.INVALID_PARAMS,
        `Step ${i + 1}: ${hotspot.type} does not support prototype reactions.`,
        "Use a frame, group, instance or shape as the hotspot.",
      );
    }
    const reaction = {
      trigger: { type: "ON_CLICK" },
      actions: [
        {
          type: "NODE",
          destinationId: to.id,
          navigation: "NAVIGATE",
          transition: {
            type: transition,
            easing: { type: "EASE_IN_AND_OUT" },
            duration,
          },
          preserveScrollPosition: false,
        },
      ],
    };
    const target = hotspot as SceneNode & {
      setReactionsAsync?: (r: unknown) => Promise<void>;
      reactions?: unknown;
    };
    if (typeof target.setReactionsAsync === "function") {
      await target.setReactionsAsync([reaction]);
    } else {
      (target as { reactions: unknown }).reactions = [reaction];
    }
    steps[i]!.hotspotId = hotspot.id;
    wired.push(hotspot.id);
    ctx.progress(i + 1, frames.length - 1, "wiring");
  }

  // Figma starts a prototype at the flow's starting frame; without one it
  // picks the top-left frame on the page, which is almost never step 1.
  const first = frames[0]!;
  if ("flowStartingPoints" in figma.currentPage) {
    const existing = figma.currentPage.flowStartingPoints ?? [];
    if (!existing.some((f) => f.nodeId === first.id)) {
      figma.currentPage.flowStartingPoints = [
        ...existing,
        { nodeId: first.id, name },
      ];
    }
  }

  demos[name] = {
    name,
    ...(typeof p.description === "string" ? { description: p.description } : {}),
    steps,
    createdAt: Date.now(),
    wiredNodeIds: wired,
  };
  writeAll(demos);

  return {
    name,
    steps: steps.length,
    wiredNodes: wired.length,
    startingFrame: { id: first.id, name: first.name },
    transition,
    hint: "The reactions are real Figma prototype reactions — press Present and the flow clicks through with no plugin running. play_demo drives the canvas instead, for a walkthrough on the design surface.",
  };
}

export async function listDemos(ctx: HandlerContext): Promise<unknown> {
  void ctx;
  const demos = readAll();
  const rows = Object.values(demos).map((d) => ({
    name: d.name,
    description: d.description ?? null,
    steps: d.steps.length,
    frames: d.steps.map((s) => s.frameName),
    createdAt: d.createdAt,
  }));
  return {
    count: rows.length,
    demos: rows,
    ...(rows.length === 0
      ? { hint: "No demos on this document yet. build_demo({ name, steps }) makes one." }
      : {}),
  };
}

export async function getDemoSpec(ctx: HandlerContext): Promise<unknown> {
  const name = String(ctx.params.name ?? "").trim();
  const demos = readAll();
  const demo = demos[name];
  if (!demo) {
    throw err(
      ErrorCode.NODE_NOT_FOUND,
      `No demo called "${name}".`,
      `This document has: ${Object.keys(demos).join(", ") || "(none)"}.`,
    );
  }
  // Frames get deleted. A spec that lists a dead frame without saying so
  // sends the caller to debug play_demo instead of their own file.
  const missing: string[] = [];
  for (const s of demo.steps) {
    if (!(await findNode(s.frameId))) missing.push(s.frameName);
  }
  return {
    ...demo,
    ...(missing.length > 0
      ? {
          missingFrames: missing,
          warning: `${missing.length} frame(s) in this demo no longer exist. Rebuild it with build_demo({ overwrite: true }).`,
        }
      : {}),
  };
}

export async function deleteDemo(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const demos = readAll();

  if (p.all === true) {
    if (p.force !== true) {
      throw err(
        ErrorCode.CONFIRM_REQUIRED,
        `This would delete all ${Object.keys(demos).length} demo(s) on the document.`,
        "Pass force: true to confirm.",
      );
    }
    const n = Object.keys(demos).length;
    writeAll({});
    return { deleted: n, all: true };
  }

  const name = String(p.name ?? "").trim();
  const demo = demos[name];
  if (!demo) {
    throw err(
      ErrorCode.NODE_NOT_FOUND,
      `No demo called "${name}".`,
      `This document has: ${Object.keys(demos).join(", ") || "(none)"}.`,
    );
  }

  // The reactions outlive the record unless asked otherwise. Deleting a
  // bookkeeping entry must not silently strip prototype links a designer may
  // have edited since — `unwire: true` is the explicit opt-in.
  let unwired = 0;
  if (p.unwire === true) {
    for (const id of demo.wiredNodeIds) {
      const node = await findNode(id);
      if (!node || !("reactions" in node)) continue;
      const target = node as SceneNode & {
        setReactionsAsync?: (r: unknown) => Promise<void>;
        reactions?: unknown;
      };
      if (typeof target.setReactionsAsync === "function") await target.setReactionsAsync([]);
      else (target as { reactions: unknown }).reactions = [];
      unwired++;
    }
  }

  delete demos[name];
  writeAll(demos);
  return {
    deleted: name,
    unwired,
    ...(p.unwire === true
      ? {}
      : { note: "The prototype reactions were left in place. Pass unwire: true to remove them too." }),
  };
}

/** setTimeout exists in the Figma plugin main thread; Promise-wrap it. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * play_demo — drive the canvas through the flow.
 *
 * Moves the viewport and the selection frame by frame on a timer, which is
 * what makes a walkthrough play on the design surface while somebody watches.
 * It does NOT drive Figma's presenter — a plugin cannot.
 *
 * `capture: true` exports one PNG per step for assembling a GIF or a video
 * elsewhere. It is off by default because the images come back as base64 and
 * a ten-step capture at scale 1 is a large response; scale defaults to 0.5
 * for the same reason.
 */
export async function playDemo(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const name = String(p.name ?? "").trim();
  const demos = readAll();
  const demo = demos[name];
  if (!demo) {
    throw err(
      ErrorCode.NODE_NOT_FOUND,
      `No demo called "${name}".`,
      `This document has: ${Object.keys(demos).join(", ") || "(none)"}.`,
    );
  }

  const speed = typeof p.speed === "number" && p.speed > 0 ? p.speed : 1;
  const capture = p.capture === true;
  const scale = typeof p.scale === "number" ? Math.max(0.1, Math.min(2, p.scale)) : 0.5;

  const played: Array<{
    step: number;
    frame: string;
    label?: string;
    heldMs: number;
    missing?: true;
    png?: string;
  }> = [];

  for (let i = 0; i < demo.steps.length; i++) {
    const step = demo.steps[i]!;
    const node = (await findNode(step.frameId)) as SceneNode | null;
    if (!node) {
      played.push({ step: i + 1, frame: step.frameName, missing: true, heldMs: 0 });
      ctx.warn(`Step ${i + 1} ("${step.frameName}") no longer exists; skipped.`);
      continue;
    }

    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);

    const entry: (typeof played)[number] = {
      step: i + 1,
      frame: step.frameName,
      ...(step.label ? { label: step.label } : {}),
      heldMs: Math.round(step.holdMs / speed),
    };
    if (capture && "exportAsync" in node) {
      const bytes = await (node as ExportMixin).exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: scale },
      });
      entry.png = encodeBase64(bytes);
    }
    played.push(entry);

    // Progress before the wait, not after: the ping is what resets the
    // bridge timeout, and a demo with 2s holds would otherwise time out
    // somewhere around step fifteen.
    ctx.progress(i + 1, demo.steps.length, `step ${i + 1}: ${step.frameName}`);
    if (i < demo.steps.length - 1) await wait(entry.heldMs);
  }

  const totalMs = played.reduce((a, s) => a + s.heldMs, 0);
  return {
    name,
    steps: played.length,
    skipped: played.filter((s) => s.missing).length,
    totalMs,
    played: capture ? played : played.map(({ png: _png, ...rest }) => rest),
    ...(capture
      ? {
          note: `${played.filter((s) => s.png).length} PNG(s) at scale ${scale}, base64. Figma plugins cannot record video — assemble these into a GIF or MP4 with a real encoder.`,
        }
      : {}),
    hint: "This drove the canvas. For a click-through anyone can run without the plugin, press Present — build_demo already wired the prototype.",
  };
}
