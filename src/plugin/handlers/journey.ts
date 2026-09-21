/// <reference types="@figma/plugin-typings" />
/**
 * Draw a laid-out journey map. Coordinates arrive already computed by
 * src/shared/journey.
 *
 * Painting order matters here more than in the other kinds, because the
 * emotion curve crosses the whole frame: lane bands first, then the curve,
 * then the dots and the cells on top of it. A curve drawn last would run
 * over the stage labels it is supposed to annotate.
 *
 * An empty cell is drawn as a faint dash rather than left blank. A blank
 * cell reads as "not filled in yet"; a dash reads as "nothing here", which
 * is a finding — a stage with no touchpoint is the thing this artefact is
 * drawn to expose, and it has to be visible on the page, not only in the
 * warnings.
 */
import { HandlerContext } from "../context.js";
import { createTree } from "./create.js";
import { openDiagramFrame, preloadDiagramFonts, pageModel } from "../diagram-apply.js";
import { err } from "../errors.js";
import { ErrorCode } from "../../shared/protocol.js";
import { JOURNEY_MARKER } from "../diagram-mark.js";
import type { DrawLane, DrawStage, JourneyDraw } from "../../shared/journey/types.js";

const INK = "#000f22";
const MUTED = "#5b6675";
const BODY = "#33404f";
const BAND = "#f6f8fa";
const CHUNK = 40;

type Spec = Record<string, unknown>;

export async function createJourney(ctx: HandlerContext): Promise<unknown> {
  const d = ctx.params as unknown as JourneyDraw;
  const font = typeof d?.font === "string" && d.font ? d.font : "Inter";
  if (!d || typeof d !== "object" || !Array.isArray(d.stages) || !Array.isArray(d.lanes)) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      "create_journey expects laid-out draw data (stages/lanes).",
      'Call it through the figma_diagram tool with type:"journey" — the server computes the grid.',
    );
  }

  let children: Spec[];
  try {
    children = [
      ...headerSpecs(d, font),
      ...laneSpecs(d, font),
      ...bandSpecs(d),
      ...curveSpecs(d),
      ...stageSpecs(d, font),
      ...cellSpecs(d, font),
      ...dotSpecs(d),
    ];
  } catch (e) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `create_journey got malformed draw data (${e instanceof Error ? e.message : String(e)}) — nothing was changed.`,
      'Call it through the figma_diagram tool with type:"journey".',
    );
  }

  await preloadDiagramFonts(ctx, font);

  const frame = await openDiagramFrame(
    ctx,
    {
      type: "FRAME",
      name: d.name,
      x: d.x,
      y: d.y,
      width: d.w,
      height: d.h,
      fill: "#ffffff",
      strokes: "#dfe4ea",
      strokeWeight: 1,
      cornerRadius: 16,
      clipsContent: false,
      ...(d.parentId ? { parentId: d.parentId } : {}),
    },
    d.intoFrameId,
  );

  let done = 0;
  for (const spec of children) {
    await createTree(sub(ctx, { ...spec, parentId: frame.id }), frame);
    done++;
    if (done % CHUNK === 0) ctx.progress(done, children.length, "drawing journey");
  }

  const nodeIds: Record<string, string> = {};
  for (const child of frame.children) {
    const hit = /^stage:([^\s]+)/.exec(child.name);
    if (hit && hit[1]) nodeIds[hit[1]] = child.id;
  }

  frame.setPluginData(
    JOURNEY_MARKER,
    JSON.stringify({
      kind: "journey",
      title: d.title,
      nodes: Object.keys(nodeIds),
      ...(d.source !== undefined ? { source: d.source } : {}),
    }),
  );

  return {
    frameId: frame.id,
    pageModel: pageModel(frame),
    name: frame.name,
    nodes: nodeIds,
    box: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
  };
}

function sub(ctx: HandlerContext, params: Spec): HandlerContext {
  return { params, warnings: ctx.warnings, progress: ctx.progress, warn: ctx.warn };
}

/**
 * A positioned text layer.
 *
 * The option field names are the SPEC key names on purpose, not shorter
 * synonyms. `diagram-spec-keys.test.ts` scans this file for every `key:` a
 * handler writes and checks create() actually reads it — a helper with its
 * own vocabulary (`size`, `align`) either defeats that scan or trips it, and
 * both outcomes are worse than typing the real names.
 */
interface TextOpts {
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontStyle?: string;
  fill?: string;
  textAlignHorizontal?: string;
  letterSpacing?: string;
}

function text(name: string, characters: string, opts: TextOpts, fontFamily: string): Spec {
  return {
    type: "TEXT",
    name,
    characters,
    fontFamily,
    fontStyle: opts.fontStyle ?? "Regular",
    fill: opts.fill ?? INK,
    textAutoResize: "HEIGHT",
    ...opts,
    ...(opts.fontStyle ? {} : { fontStyle: "Regular" }),
  };
}

function headerSpecs(d: JourneyDraw, FONT: string): Spec[] {
  const out: Spec[] = [
    text("title", d.title, { x: 32, y: 24, width: Math.max(120, d.w - 64), fontSize: 20, fontStyle: "Bold" }, FONT),
  ];
  const sub2 = [d.subtitle, d.persona ? `Persona: ${d.persona}` : ""].filter(Boolean).join("  ·  ");
  if (sub2) {
    out.push(
      text("subtitle", sub2, { x: 32, y: 56, width: Math.max(120, d.w - 64), fontSize: 13, fill: MUTED }, FONT),
    );
  }
  return out;
}

/** The lane label in the gutter, and the band behind the row. */
function laneSpecs(d: JourneyDraw, FONT: string): Spec[] {
  const out: Spec[] = [];
  for (const lane of d.lanes) {
    out.push({
      type: "RECTANGLE",
      name: `lane-band ${lane.key}`,
      x: 32,
      y: lane.y,
      width: Math.max(1, d.w - 64),
      height: lane.h,
      fill: lane.muted ? "#fbfcfd" : BAND,
      cornerRadius: 8,
    });
    out.push(
      text(
        `lane ${lane.key}`,
        lane.label,
        {
          x: 44,
          y: lane.y + 10,
          width: d.gutter - 24,
          fontSize: 11,
          fontStyle: "Bold",
          fill: lane.accent ?? (lane.muted ? MUTED : INK),
          letterSpacing: "6%",
        },
        FONT,
      ),
    );
  }
  return out;
}

/** The emotion band: a backing panel and its neutral mid-line. */
function bandSpecs(d: JourneyDraw): Spec[] {
  if (d.band.h <= 0) return [];
  return [
    {
      type: "RECTANGLE",
      name: "emotion-band",
      x: 32,
      y: d.band.y,
      width: Math.max(1, d.w - 64),
      height: d.band.h,
      fill: "#ffffff",
      strokes: "#e8ecf1",
      strokeWeight: 1,
      cornerRadius: 8,
    },
    {
      type: "RECTANGLE",
      name: "emotion-midline",
      x: 32 + d.gutter,
      y: d.band.y + d.band.h / 2,
      width: Math.max(1, d.w - 64 - d.gutter),
      height: 1,
      fill: "#e8ecf1",
    },
  ];
}

/**
 * The curve, as one VECTOR.
 *
 * One layer rather than a segment per pair: the emotion track is a single
 * reading, and splitting it would let somebody hide half of it by deleting a
 * layer they thought was decoration.
 */
function curveSpecs(d: JourneyDraw): Spec[] {
  if (!Array.isArray(d.curve) || d.curve.length < 2) return [];
  return [
    {
      type: "VECTOR",
      name: "emotion-curve",
      points: d.curve,
      strokes: "#2563eb",
      strokeWeight: 2,
      strokeJoin: "ROUND",
      strokeCap: "ROUND",
      cornerRadius: 24,
      endArrow: false,
      fills: [],
    },
  ];
}

function stageSpecs(d: JourneyDraw, FONT: string): Spec[] {
  return d.stages.map((s) => ({
    type: "FRAME",
    name: s.name,
    x: s.at.x,
    y: s.at.y,
    width: s.at.w,
    height: s.at.h,
    fill: s.fill,
    strokes: s.stroke,
    strokeWeight: 1.25,
    strokeAlign: "OUTSIDE",
    cornerRadius: 8,
    clipsContent: true,
    layoutMode: "VERTICAL",
    primaryAxisSizingMode: "FIXED",
    counterAxisSizingMode: "FIXED",
    primaryAxisAlignItems: "CENTER",
    itemSpacing: 2,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 8,
    paddingBottom: 8,
    children: [
      {
        type: "TEXT",
        name: "index",
        layoutAlign: "STRETCH",
        characters: `STAGE ${s.index}`,
        fontSize: 10,
        fontFamily: FONT,
        fontStyle: "Bold",
        fill: s.stroke,
        letterSpacing: "6%",
        textAutoResize: "HEIGHT",
      },
      {
        type: "TEXT",
        name: "label",
        layoutAlign: "STRETCH",
        characters: s.label.join("\n"),
        fontSize: 13,
        fontFamily: FONT,
        fontStyle: "Medium",
        fill: INK,
        textAutoResize: "HEIGHT",
      },
      ...(s.screenId?.length
        ? [
            {
              type: "TEXT",
              name: "screen",
              layoutAlign: "STRETCH",
              characters: `· ${s.screenId.join(" · ")}`,
              fontSize: 10,
              fontFamily: FONT,
              fontStyle: "Regular",
              fill: MUTED,
              textAutoResize: "HEIGHT",
            },
          ]
        : []),
    ],
  }));
}

function cellSpecs(d: JourneyDraw, FONT: string): Spec[] {
  const out: Spec[] = [];
  d.stages.forEach((s) => {
    d.lanes.forEach((lane: DrawLane, li: number) => {
      const c = s.cells[li];
      if (!c) return;
      if (c.empty) {
        out.push(
          text(
            `cell ${s.id}/${lane.key}`,
            "—",
            {
              x: s.at.x + 10,
              y: lane.y + 10,
              width: s.at.w - 20,
              fontSize: 12,
              fill: "#c3cad3",
            },
            FONT,
          ),
        );
        return;
      }
      out.push(
        text(
          `cell ${s.id}/${lane.key}`,
          c.items.map((i) => i.join("\n")).join("\n"),
          {
            x: s.at.x + 10,
            y: lane.y + 10,
            width: s.at.w - 20,
            fontSize: 12,
            fill: lane.accent ?? (lane.muted ? MUTED : BODY),
          },
          FONT,
        ),
      );
    });
  });
  return out;
}

/** The dots go last so they sit on top of the curve they belong to. */
function dotSpecs(d: JourneyDraw): Spec[] {
  if (d.band.h <= 0) return [];
  return d.stages.map((s: DrawStage) => ({
    type: "ELLIPSE",
    name: `feeling ${s.id}`,
    x: s.dot.x - 7,
    y: s.dot.y - 7,
    width: 14,
    height: 14,
    fill: s.stroke,
    strokes: "#ffffff",
    strokeWeight: 2,
  }));
}
