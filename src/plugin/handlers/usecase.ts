/// <reference types="@figma/plugin-typings" />
/**
 * Draw a laid-out use case diagram. Coordinates arrive already computed by
 * src/shared/usecase.
 *
 * Painting order: boundary, then links, then actors and ovals on top, so the
 * lines disappear under the shapes they touch instead of crossing them.
 *
 * The stick figure is drawn from primitives rather than imported as an SVG.
 * `figma.createNodeFromSvg` is one of the two builders that bypass
 * `createTree` (see ARCHITECTURE.md) and it returns a clipping group with a
 * size nobody chose — for a shape this simple, five vectors cost less than
 * the audit of what the import brought with it.
 */
import { HandlerContext } from "../context.js";
import { createTree } from "./create.js";
import { openDiagramFrame, preloadDiagramFonts, pageModel } from "../diagram-apply.js";
import { err } from "../errors.js";
import { ErrorCode } from "../../shared/protocol.js";
import { USECASE_MARKER } from "../diagram-mark.js";
import type { DrawActor, DrawLink, DrawUseCase, UseCaseDraw } from "../../shared/usecase/types.js";
import { isFigJam } from "../surface.js";
import { renderFigJam } from "../figjam/render.js";

const INK = "#000f22";
const MUTED = "#5b6675";
const BODY = "#33404f";
const OVAL_FILL = "#eef2f7";
const OVAL_STROKE = "#475569";
const ORPHAN = "#b7791f";
const CHUNK = 40;

type Spec = Record<string, unknown>;

export async function createUseCase(ctx: HandlerContext): Promise<unknown> {
  const d = ctx.params as unknown as UseCaseDraw;
  const font = typeof d?.font === "string" && d.font ? d.font : "Inter";
  if (
    !d ||
    typeof d !== "object" ||
    !Array.isArray(d.actors) ||
    !Array.isArray(d.useCases) ||
    !Array.isArray(d.links) ||
    !d.boundary
  ) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      "create_usecase expects laid-out draw data (actors/useCases/links/boundary).",
      'Call it through the figma_diagram tool with type:"usecase" — the server computes the layout.',
    );
  }

  // The board version keeps the vocabulary (ellipse = use case, square =
  // actor) and drops the boundary rectangle: a FigJam SECTION already draws
  // a named box around everything, and two nested boxes read as two
  // different scopes. The section IS the system boundary here.
  if (isFigJam()) {
    return renderFigJam(
      ctx,
      {
        name: d.name,
        title: d.title,
        subtitle: [d.subtitle, `Trong phạm vi: ${d.boundary.label}`].filter(Boolean).join("  ·  "),
        x: d.x,
        y: d.y,
        w: d.w,
        h: d.h,
      },
      [
        ...d.actors.map((a) => ({
          id: a.id,
          name: a.name,
          at: a.at,
          lines: [...a.label, ...a.detail],
          shape: (a.figure === "box" ? "SQUARE" : "ELLIPSE") as ShapeWithTextNode["shapeType"],
          fill: "#ffffff",
          stroke: "#000f22",
        })),
        ...d.useCases.map((u) => ({
          id: u.id,
          name: u.name,
          at: u.at,
          lines: [...u.label, ...u.detail],
          shape: "ELLIPSE" as const,
          fill: u.orphan ? "#fff8e6" : "#eef2f7",
          stroke: u.orphan ? "#b7791f" : "#475569",
        })),
      ],
      d.links.map((l) => ({
        id: l.id,
        from: linkEnds(l).from,
        to: linkEnds(l).to,
        ...(l.stereotype ? { label: l.stereotype } : {}),
        dashed: l.kind !== "association",
        color: l.color,
        // An association states a relationship; only include/extend are
        // directed, which is the same call the Design renderer makes.
        arrow: l.kind !== "association",
        line: (l.kind === "association" ? "STRAIGHT" : "ELBOWED") as ConnectorNode["connectorLineType"],
      })),
      font,
      d.intoFrameId,
    );
  }

  let children: Spec[];
  try {
    children = [
      ...headerSpecs(d, font),
      boundarySpec(d, font),
      ...linkSpecs(d.links, font),
      ...d.actors.map((a) => actorSpec(a, font)),
      ...d.useCases.map((u) => ovalSpec(u, font)),
    ];
  } catch (e) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `create_usecase got malformed draw data (${e instanceof Error ? e.message : String(e)}) — nothing was changed.`,
      'Call it through the figma_diagram tool with type:"usecase".',
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
    if (done % CHUNK === 0) ctx.progress(done, children.length, "drawing use cases");
  }

  const nodeIds: Record<string, string> = {};
  for (const child of frame.children) {
    const hit = /^(?:usecase|actor):([^\s]+)/.exec(child.name);
    if (hit && hit[1]) nodeIds[hit[1]] = child.id;
  }

  frame.setPluginData(
    USECASE_MARKER,
    JSON.stringify({
      kind: "usecase",
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

/**
 * The two ends of a link id.
 *
 * This kind writes `a->b` for an association and `a=include=>b` for a UML
 * relationship, so the shared splitter cannot read it — and should not
 * learn to, since the convention is local to here.
 */
function linkEnds(l: DrawLink): { from: string; to: string } {
  for (const sep of ["=include=>", "=extend=>", "->"]) {
    const i = l.id.indexOf(sep);
    if (i > 0) return { from: l.id.slice(0, i), to: l.id.slice(i + sep.length) };
  }
  return { from: l.id, to: l.id };
}

function sub(ctx: HandlerContext, params: Spec): HandlerContext {
  return { params, warnings: ctx.warnings, progress: ctx.progress, warn: ctx.warn };
}

function headerSpecs(d: UseCaseDraw, FONT: string): Spec[] {
  const out: Spec[] = [
    {
      type: "TEXT",
      name: "title",
      x: 32,
      y: 24,
      width: Math.max(120, d.w - 64),
      characters: d.title,
      fontSize: 20,
      fontFamily: FONT,
      fontStyle: "Bold",
      fill: INK,
      textAutoResize: "HEIGHT",
    },
  ];
  if (d.subtitle) {
    out.push({
      type: "TEXT",
      name: "subtitle",
      x: 32,
      y: 56,
      width: Math.max(120, d.w - 64),
      characters: d.subtitle,
      fontSize: 13,
      fontFamily: FONT,
      fontStyle: "Regular",
      fill: MUTED,
      textAutoResize: "HEIGHT",
    });
  }
  return out;
}

/** The system boundary: the rectangle the whole scope argument is about. */
function boundarySpec(d: UseCaseDraw, FONT: string): Spec {
  return {
    type: "FRAME",
    name: "system-boundary",
    x: d.boundary.x,
    y: d.boundary.y,
    width: d.boundary.w,
    height: d.boundary.h,
    fills: [],
    strokes: "#94a3b8",
    strokeWeight: 1.5,
    strokeAlign: "INSIDE",
    cornerRadius: 10,
    clipsContent: false,
    layoutMode: "NONE",
    children: [
      {
        type: "TEXT",
        name: "system-label",
        x: 16,
        y: 10,
        width: Math.max(60, d.boundary.w - 32),
        characters: d.boundary.label,
        fontSize: 12,
        fontFamily: FONT,
        fontStyle: "Bold",
        fill: MUTED,
        letterSpacing: "6%",
        textAutoResize: "HEIGHT",
      },
    ],
  };
}

function linkSpecs(links: DrawLink[], FONT: string): Spec[] {
  const out: Spec[] = [];
  for (const l of links) {
    out.push({
      type: "VECTOR",
      name: `link ${l.id}`,
      points: l.points,
      strokes: l.color,
      strokeWeight: l.kind === "association" ? 1.25 : 1,
      strokeCap: "NONE",
      // An association has no arrow: it says "these are related", not "go
      // here". include/extend are directed, and UML gives them an open arrow.
      endArrow: l.kind !== "association",
      fills: [],
      ...(l.dashed ? { dashPattern: [6, 4] } : {}),
    });
    if (l.stereotype && l.at) {
      out.push({
        type: "TEXT",
        name: `stereotype ${l.id}`,
        x: l.at.x - 40,
        y: l.at.y - 9,
        width: 80,
        characters: l.stereotype,
        fontSize: 10,
        fontFamily: FONT,
        fontStyle: "Regular",
        fill: MUTED,
        textAlignHorizontal: "CENTER",
        textAutoResize: "HEIGHT",
      });
    }
  }
  return out;
}

/** Five primitives: head, body, two arms, two legs. */
function stickFigure(): Spec[] {
  return [
    { type: "ELLIPSE", name: "head", x: 20, y: 0, width: 16, height: 16, fills: [], strokes: INK, strokeWeight: 1.5 },
    { type: "VECTOR", name: "body", points: [[28, 16], [28, 34]], strokes: INK, strokeWeight: 1.5, endArrow: false, fills: [] },
    { type: "VECTOR", name: "arms", points: [[16, 24], [40, 24]], strokes: INK, strokeWeight: 1.5, endArrow: false, fills: [] },
    { type: "VECTOR", name: "leg-l", points: [[28, 34], [19, 48]], strokes: INK, strokeWeight: 1.5, endArrow: false, fills: [] },
    { type: "VECTOR", name: "leg-r", points: [[28, 34], [37, 48]], strokes: INK, strokeWeight: 1.5, endArrow: false, fills: [] },
  ];
}

/** A system actor is a box, not a person — see types.ts. */
function systemBox(): Spec[] {
  return [
    {
      type: "RECTANGLE",
      name: "box",
      x: 14,
      y: 4,
      width: 28,
      height: 40,
      fills: [],
      strokes: INK,
      strokeWeight: 1.5,
      cornerRadius: 3,
    },
    { type: "VECTOR", name: "rule", points: [[14, 14], [42, 14]], strokes: INK, strokeWeight: 1.5, endArrow: false, fills: [] },
  ];
}

function actorSpec(a: DrawActor, FONT: string): Spec {
  const textY = 54;
  return {
    type: "FRAME",
    name: a.name,
    x: a.at.x,
    y: a.at.y,
    width: a.at.w,
    height: a.at.h,
    fills: [],
    clipsContent: false,
    layoutMode: "NONE",
    children: [
      ...(a.figure === "box" ? systemBox() : stickFigure()),
      {
        type: "TEXT",
        name: "label",
        x: 0,
        y: textY,
        width: a.at.w,
        characters: a.label.join("\n"),
        fontSize: 13,
        fontFamily: FONT,
        fontStyle: "Medium",
        fill: INK,
        textAlignHorizontal: "CENTER",
        textAutoResize: "HEIGHT",
      },
      ...(a.detail.length
        ? [
            {
              type: "TEXT",
              name: "detail",
              x: 0,
              y: textY + 18 * a.label.length,
              width: a.at.w,
              characters: a.detail.join("\n"),
              fontSize: 11,
              fontFamily: FONT,
              fontStyle: "Regular",
              fill: MUTED,
              textAlignHorizontal: "CENTER",
              textAutoResize: "HEIGHT",
            },
          ]
        : []),
    ],
  };
}

/**
 * The oval, with its text in a separate centred frame on top.
 *
 * An ELLIPSE cannot hold children, so unlike the sitemap's page boxes the
 * label cannot live inside the shape. The label frame is therefore its own
 * layer at the same coordinates — which is the compromise the shape forces,
 * and worth knowing before somebody drags an oval and wonders why its text
 * stayed put.
 */
function ovalSpec(u: DrawUseCase, FONT: string): Spec {
  const stroke = u.orphan ? ORPHAN : OVAL_STROKE;
  return {
    type: "GROUP",
    name: u.name,
    children: [
      {
        type: "ELLIPSE",
        name: "oval",
        x: u.at.x,
        y: u.at.y,
        width: u.at.w,
        height: u.at.h,
        fill: u.orphan ? "#fff8e6" : OVAL_FILL,
        strokes: stroke,
        strokeWeight: u.orphan ? 1.75 : 1.25,
        ...(u.orphan ? { dashPattern: [6, 4] } : {}),
      },
      {
        type: "FRAME",
        name: "label",
        x: u.at.x + 18,
        y: u.at.y,
        width: u.at.w - 36,
        height: u.at.h,
        fills: [],
        layoutMode: "VERTICAL",
        primaryAxisSizingMode: "FIXED",
        counterAxisSizingMode: "FIXED",
        primaryAxisAlignItems: "CENTER",
        counterAxisAlignItems: "CENTER",
        itemSpacing: 2,
        children: [
          {
            type: "TEXT",
            name: "name",
            layoutAlign: "STRETCH",
            characters: u.label.join("\n"),
            fontSize: 13,
            fontFamily: FONT,
            fontStyle: "Medium",
            fill: INK,
            textAlignHorizontal: "CENTER",
            textAutoResize: "HEIGHT",
          },
          ...(u.detail.length
            ? [
                {
                  type: "TEXT",
                  name: "detail",
                  layoutAlign: "STRETCH",
                  characters: u.detail.join("\n"),
                  fontSize: 11,
                  fontFamily: FONT,
                  fontStyle: "Regular",
                  fill: BODY,
                  textAlignHorizontal: "CENTER",
                  textAutoResize: "HEIGHT",
                },
              ]
            : []),
          ...(u.screenId?.length
            ? [
                {
                  type: "TEXT",
                  name: "screen",
                  layoutAlign: "STRETCH",
                  characters: `· ${u.screenId.join(" · ")}`,
                  fontSize: 10,
                  fontFamily: FONT,
                  fontStyle: "Regular",
                  fill: MUTED,
                  textAlignHorizontal: "CENTER",
                  textAutoResize: "HEIGHT",
                },
              ]
            : []),
        ],
      },
    ],
  };
}
