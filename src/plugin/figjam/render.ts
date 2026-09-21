/// <reference types="@figma/plugin-typings" />
/**
 * One renderer for every diagram kind, on FigJam.
 *
 * The Design renderers each build their own node tree because each kind has
 * its own anatomy — an ERD row, a sequence activation bar, a persona card.
 * FigJam has no auto-layout, so none of that anatomy is expressible anyway,
 * and the vocabulary collapses to three things: a shape with text in it, a
 * connector between two shapes, and a sticky for anything that is a note.
 * Three things is one renderer, not nine.
 *
 * The connector is the whole point. `magnet: "AUTO"` binds an endpoint to a
 * NODE, not to a coordinate, and FigJam re-routes it when the node moves —
 * which is the job `shared/<kind>/route.ts`, `diagram-reflow.ts` and the live
 * `nodechange` watcher all exist to do on Design, where connectors do not
 * exist. On a board every one of those is dead weight, so this file does not
 * read `edge.points` at all. It reads which node each edge JOINS.
 *
 * What is lost, stated plainly: multi-compartment boxes. An ERD entity's
 * column list, a state's entry/do/exit block and a persona's five sections
 * are all auto-layout constructs. Here they become extra lines inside the
 * shape's own text, or a sticky beside it. That is a real downgrade in
 * density and a real upgrade in editability — a board is a thing people
 * drag around, and everything here stays draggable.
 */
import { HandlerContext } from "../context.js";
import { err } from "../errors.js";
import { ErrorCode } from "../../shared/protocol.js";
import type { Placement } from "../../shared/diagram/types.js";

/** A box to draw. Kind-agnostic: every kind maps its own nodes onto this. */
export interface FigJamBox {
  id: string;
  /** Layer name, `kind:id · label`, so a reflow or a read can find it. */
  name: string;
  at: Placement;
  /** Text inside the shape. Extra lines become extra lines. */
  lines: string[];
  shape?: ShapeWithTextNode["shapeType"];
  fill?: string;
  stroke?: string;
  /** Drawn as a sticky beside the shape rather than inside it. */
  note?: string[];
}

/** A relationship to draw. Endpoints are NODE IDS, never coordinates. */
export interface FigJamLink {
  id: string;
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  color?: string;
  /** Default ELBOWED, which is what a FigJam user expects from a flow. */
  line?: ConnectorNode["connectorLineType"];
  /** No head for a containment line — see the sitemap handler. */
  arrow?: boolean;
}

export interface FigJamFrame {
  name: string;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const INK = "#000f22";
const MUTED = "#5b6675";

function rgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

const solid = (hex: string): SolidPaint => ({ type: "SOLID", color: rgb(hex) });

/**
 * FigJam's own fonts.
 *
 * Inter is present on a board but the default sticky/shape face is not, and
 * a shape whose font never loaded renders empty with no error — the same
 * silent-blank failure the CJK warning exists for on Design. Load both
 * weights of whatever the caller asked for, and fall back once.
 */
async function loadFonts(family: string, ctx: HandlerContext): Promise<string> {
  for (const candidate of [family, "Inter"]) {
    try {
      await Promise.all([
        figma.loadFontAsync({ family: candidate, style: "Medium" }),
        figma.loadFontAsync({ family: candidate, style: "Regular" }),
      ]);
      if (candidate !== family) {
        ctx.warn(`Font "${family}" is not available on this board; drew with ${candidate}.`);
      }
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  throw err(
    ErrorCode.FONT_UNAVAILABLE,
    `Neither "${family}" nor Inter could be loaded on this board.`,
    "Pass options.font with a family this file has, or install the font in Figma.",
  );
}

export interface FigJamResult {
  frameId: string;
  name: string;
  nodes: Record<string, string>;
  box: { x: number; y: number; w: number; h: number };
  surface: "figjam";
}

/**
 * Draw a diagram on a FigJam board.
 *
 * The container is a SECTION, not a frame: a section is FigJam's own
 * grouping, it shows its name on the canvas, and people already drag them
 * around. A frame on a board reads as a foreign object.
 */
export async function renderFigJam(
  ctx: HandlerContext,
  frame: FigJamFrame,
  boxes: FigJamBox[],
  links: FigJamLink[],
  font: string,
  intoSectionId?: string,
): Promise<FigJamResult> {
  const family = await loadFonts(font || "Inter", ctx);

  let section: SectionNode;
  if (intoSectionId) {
    const existing = await figma.getNodeByIdAsync(intoSectionId);
    if (!existing || existing.type !== "SECTION") {
      throw err(
        ErrorCode.NODE_NOT_FOUND,
        `"${intoSectionId}" is not a section on this board.`,
        "On FigJam a diagram lives in a SECTION. Pass the sectionId a previous draw returned, or omit it to make a new one.",
      );
    }
    section = existing;
    // Redraw in place keeps the section id, so comments pinned to it and
    // wherever the user dragged it both survive — same bargain the Design
    // renderer strikes with intoFrameId.
    for (const child of [...section.children]) child.remove();
  } else {
    section = figma.createSection();
    figma.currentPage.appendChild(section);
  }

  section.name = frame.name;
  section.x = frame.x;
  section.y = frame.y;
  section.resizeWithoutConstraints(Math.max(200, frame.w), Math.max(160, frame.h + 64));
  section.fills = [solid("#ffffff")];

  // Title. A board already shows the section name, so the title text is the
  // subtitle's carrier more than its own — but a section name is easy to
  // miss when zoomed out, and a screenshot of the section alone loses it.
  const header = figma.createText();
  header.fontName = { family, style: "Medium" };
  header.fontSize = 20;
  header.characters = frame.title;
  header.fills = [solid(INK)];
  header.x = 24;
  header.y = 16;
  section.appendChild(header);

  if (frame.subtitle) {
    const sub = figma.createText();
    sub.fontName = { family, style: "Regular" };
    sub.fontSize = 13;
    sub.characters = frame.subtitle;
    sub.fills = [solid(MUTED)];
    sub.x = 24;
    sub.y = 44;
    section.appendChild(sub);
  }

  const top = frame.subtitle ? 76 : 56;
  const made = new Map<string, ShapeWithTextNode>();
  const nodes: Record<string, string> = {};

  for (const box of boxes) {
    const shape = figma.createShapeWithText();
    shape.shapeType = box.shape ?? "ROUNDED_RECTANGLE";
    shape.name = box.name;
    shape.fills = [solid(box.fill ?? "#ffffff")];
    shape.strokes = [solid(box.stroke ?? INK)];
    shape.strokeWeight = 1.25;
    // Text before resize: the sublayer's font has to be set while it is
    // empty, and setting characters first makes the shape auto-grow to a
    // size the layout did not choose.
    shape.text.fontName = { family, style: "Medium" };
    shape.text.fontSize = 13;
    shape.text.characters = box.lines.join("\n");
    shape.text.fills = [solid(INK)];
    shape.resize(Math.max(40, box.at.w), Math.max(40, box.at.h));
    shape.x = box.at.x;
    shape.y = top + box.at.y;
    section.appendChild(shape);
    made.set(box.id, shape);
    nodes[box.id] = shape.id;

    if (box.note?.length) {
      const sticky = figma.createSticky();
      sticky.text.fontName = { family, style: "Regular" };
      sticky.text.characters = box.note.join("\n");
      sticky.x = box.at.x + box.at.w + 12;
      sticky.y = top + box.at.y;
      sticky.name = `note:${box.id}`;
      section.appendChild(sticky);
    }
  }

  // Connectors last, so they sit above the shapes they join — and bound BY
  // ID, so dragging either end takes the line with it. No points, no router,
  // no reflow pass. This is the whole reason FigJam is worth supporting.
  let drawn = 0;
  for (const link of links) {
    const a = made.get(link.from);
    const b = made.get(link.to);
    if (!a || !b) {
      ctx.warn(`Link ${link.id} joins ${link.from}→${link.to}, and one of them was not drawn.`);
      continue;
    }
    const c = figma.createConnector();
    c.name = `edge ${link.id}`;
    c.connectorStart = { endpointNodeId: a.id, magnet: "AUTO" };
    c.connectorEnd = { endpointNodeId: b.id, magnet: "AUTO" };
    c.connectorLineType = link.line ?? "ELBOWED";
    c.connectorStartStrokeCap = "NONE";
    c.connectorEndStrokeCap = link.arrow === false ? "NONE" : "ARROW_LINES";
    c.strokes = [solid(link.color ?? INK)];
    c.strokeWeight = 1.5;
    if (link.dashed) c.dashPattern = [6, 4];
    if (link.label) {
      c.text.fontName = { family, style: "Regular" };
      c.text.fontSize = 11;
      c.text.characters = link.label;
    }
    section.appendChild(c);
    drawn++;
  }

  if (drawn === 0 && links.length > 0) {
    ctx.warn("No connector could be drawn — every link named a box that is not on the board.");
  }

  return {
    frameId: section.id,
    name: section.name,
    nodes,
    box: { x: section.x, y: section.y, w: section.width, h: section.height },
    surface: "figjam",
  };
}
