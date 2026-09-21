/// <reference types="@figma/plugin-typings" />
/**
 * Draw a laid-out persona set. Every coordinate arrives already computed by
 * src/shared/persona, so this handler is deliberately dumb.
 *
 * One thing it decides, and it is the same call the sitemap handler made for
 * the same reason: a card is a FRAME with auto-layout and its text INSIDE
 * it, not a rectangle with labels parked on top. Dragging a persona card in
 * Figma then carries its contents along, and a card whose text is edited by
 * hand re-flows instead of overlapping.
 *
 * The avatar is initials on a coloured disc, never a photo. A stock
 * headshot makes a persona feel researched when it is not, which is the
 * failure mode this whole kind is shaped against.
 */
import { HandlerContext } from "../context.js";
import { createTree } from "./create.js";
import { openDiagramFrame, preloadDiagramFonts, pageModel } from "../diagram-apply.js";
import { err } from "../errors.js";
import { ErrorCode } from "../../shared/protocol.js";
import { PERSONA_MARKER } from "../diagram-mark.js";
import type { DrawPersona, PersonaDraw } from "../../shared/persona/types.js";

const INK = "#000f22";
const MUTED = "#5b6675";
const BODY = "#33404f";
const CHUNK = 20;

type Spec = Record<string, unknown>;

export async function createPersona(ctx: HandlerContext): Promise<unknown> {
  const d = ctx.params as unknown as PersonaDraw;
  const font = typeof d?.font === "string" && d.font ? d.font : "Inter";
  if (!d || typeof d !== "object" || !Array.isArray(d.personas)) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      "create_persona expects laid-out draw data (personas).",
      'Call it through the figma_diagram tool with type:"persona" — the server measures the cards.',
    );
  }

  // Built BEFORE the frame is opened: a redraw in place empties the frame as
  // it opens it, so malformed draw data that threw here would leave the
  // user's set wiped with nothing drawn back.
  let children: Spec[];
  try {
    children = [...headerSpecs(d, font), ...d.personas.map((p) => cardSpec(p, font))];
  } catch (e) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `create_persona got malformed draw data (${e instanceof Error ? e.message : String(e)}) — nothing was changed.`,
      'Call it through the figma_diagram tool with type:"persona".',
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
    if (done % CHUNK === 0) ctx.progress(done, children.length, "drawing personas");
  }

  const nodeIds: Record<string, string> = {};
  for (const child of frame.children) {
    const hit = /^persona:([^\s]+)/.exec(child.name);
    if (hit && hit[1]) nodeIds[hit[1]] = child.id;
  }

  frame.setPluginData(
    PERSONA_MARKER,
    JSON.stringify({
      kind: "persona",
      title: d.title,
      nodes: Object.keys(nodeIds),
      // The MODEL, so the next change can be a patch instead of the whole
      // spec again.
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

function headerSpecs(d: PersonaDraw, FONT: string): Spec[] {
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

/**
 * A stretched text layer inside an auto-layout card.
 *
 * Parameters are named after the SPEC keys they become, and the signature
 * stays on one line, because `diagram-spec-keys.test.ts` scans this file for
 * every `key:` a handler writes and checks create() reads it. A wrapped
 * signature puts parameter names through that scan as if they were spec
 * keys — which is how `FONT:` got reported here the first time.
 */
function text(name: string, characters: string, fontSize: number, fontStyle: string, fill: string, fontFamily: string): Spec {
  return {
    type: "TEXT",
    name,
    layoutAlign: "STRETCH",
    characters,
    fontSize,
    fontFamily,
    fontStyle,
    fill,
    textAutoResize: "HEIGHT",
  };
}

function cardSpec(p: DrawPersona, FONT: string): Spec {
  const kids: Spec[] = [];

  // --- header: initials disc, name, title, role chip ---
  kids.push({
    type: "FRAME",
    name: "header",
    layoutAlign: "STRETCH",
    layoutMode: "HORIZONTAL",
    primaryAxisSizingMode: "FIXED",
    counterAxisSizingMode: "AUTO",
    counterAxisAlignItems: "CENTER",
    itemSpacing: 12,
    fills: [],
    children: [
      {
        type: "FRAME",
        name: "avatar",
        width: 44,
        height: 44,
        cornerRadius: 22,
        fill: p.accent,
        layoutMode: "HORIZONTAL",
        primaryAxisSizingMode: "FIXED",
        counterAxisSizingMode: "FIXED",
        primaryAxisAlignItems: "CENTER",
        counterAxisAlignItems: "CENTER",
        itemSpacing: 0,
        children: [
          {
            type: "TEXT",
            name: "initials",
            characters: p.initials,
            fontSize: 16,
            fontFamily: FONT,
            fontStyle: "Bold",
            fill: "#ffffff",
            textAutoResize: "WIDTH_AND_HEIGHT",
          },
        ],
      },
      {
        type: "FRAME",
        name: "who",
        layoutGrow: 1,
        layoutMode: "VERTICAL",
        primaryAxisSizingMode: "AUTO",
        counterAxisSizingMode: "FIXED",
        itemSpacing: 1,
        fills: [],
        children: [
          text("name", p.displayName, 16, "Bold", INK, FONT),
          ...(p.title ? [text("title", p.title, 12, "Regular", MUTED, FONT)] : []),
          ...(p.screenId?.length
            ? [text("screen", `· ${p.screenId.join(" · ")}`, 11, "Regular", MUTED, FONT)]
            : []),
        ],
      },
    ],
  });

  // The role chip. A negative persona is the one people forget exists, so it
  // is marked as loudly as the primary rather than being left off.
  kids.push({
    type: "FRAME",
    name: "role",
    layoutMode: "HORIZONTAL",
    primaryAxisSizingMode: "AUTO",
    counterAxisSizingMode: "AUTO",
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 3,
    paddingBottom: 3,
    itemSpacing: 0,
    cornerRadius: 4,
    fill: p.accent,
    children: [
      {
        type: "TEXT",
        name: "label",
        characters: p.roleLabel,
        fontSize: 10,
        fontFamily: FONT,
        fontStyle: "Bold",
        fill: "#ffffff",
        letterSpacing: "4%",
        textAutoResize: "WIDTH_AND_HEIGHT",
      },
    ],
  });

  if (p.quote.length) {
    kids.push({
      type: "FRAME",
      name: "quote",
      layoutAlign: "STRETCH",
      layoutMode: "HORIZONTAL",
      primaryAxisSizingMode: "FIXED",
      counterAxisSizingMode: "AUTO",
      itemSpacing: 10,
      paddingTop: 2,
      paddingBottom: 2,
      fills: [],
      children: [
        // A left rule rather than a box: the quote is the person speaking,
        // and a full-bordered panel makes it read as a system message.
        {
          type: "RECTANGLE",
          name: "rule",
          width: 3,
          layoutAlign: "STRETCH",
          fill: p.accent,
          cornerRadius: 2,
        },
        {
          ...text("text", p.quote.join("\n"), 13, "Medium", INK, FONT),
          layoutGrow: 1,
          layoutAlign: "INHERIT",
        },
      ],
    });
  }

  if (p.scenario.length) {
    kids.push(text("scenario", p.scenario.join("\n"), 12, "Regular", BODY, FONT));
  }

  for (const s of p.sections) {
    kids.push({
      type: "FRAME",
      name: `section ${s.label}`,
      layoutAlign: "STRETCH",
      layoutMode: "VERTICAL",
      primaryAxisSizingMode: "AUTO",
      counterAxisSizingMode: "FIXED",
      itemSpacing: 3,
      fills: [],
      children: [
        {
          ...text("label", s.label, 11, "Bold", s.muted ? MUTED : p.accent, FONT),
          letterSpacing: "6%",
        },
        ...s.items.map((item, i) =>
          text(`item-${i}`, item.join("\n"), 12, "Regular", s.muted ? MUTED : BODY, FONT),
        ),
      ],
    });
  }

  return {
    type: "FRAME",
    name: p.name,
    x: p.at.x,
    y: p.at.y,
    width: p.at.w,
    height: p.at.h,
    fill: p.fill,
    strokes: p.stroke,
    strokeWeight: 1.25,
    // OUTSIDE, so the border does not eat the auto-layout content box — with
    // an inside stroke the last wrapped line hangs past the bottom and comes
    // back clipped.
    strokeAlign: "OUTSIDE",
    cornerRadius: 12,
    clipsContent: true,
    layoutMode: "VERTICAL",
    primaryAxisSizingMode: "FIXED",
    counterAxisSizingMode: "FIXED",
    itemSpacing: 10,
    paddingLeft: 18,
    paddingRight: 18,
    paddingTop: 18,
    paddingBottom: 18,
    children: kids,
  };
}
