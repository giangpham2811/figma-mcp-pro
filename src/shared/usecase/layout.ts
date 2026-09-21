/**
 * Use case layout: primary actors left, the system boundary in the middle,
 * secondary and system actors right.
 *
 * Associations are STRAIGHT LINES from an actor's anchor to the nearest
 * point on the oval's edge. Not orthogonal, and that is a decision about
 * meaning rather than looks: an elbowed line reads as a route through a
 * process, and a use case diagram is not a process — it is a statement of
 * what the system does for whom. The repo's orthogonal router is right for
 * an activity diagram and wrong here.
 *
 * Crossings are therefore accepted. In a use case diagram a line that
 * crosses another is ordinary, while a line that detours around the whole
 * picture to avoid a crossing reads as a mistake.
 */
import { lineHeight, wrapToWidth, headerHeight } from "../diagram/metrics.js";
import { DEFAULT_FONT, INK, MUTED } from "../diagram/palette.js";
import type {
  ActorSpec,
  DrawActor,
  DrawLink,
  DrawUseCase,
  UseCaseDraw,
  UseCaseOptions,
  UseCaseSpec,
} from "./types.js";

const PAD_X = 32;
const ACTOR_W = 132;
const ACTOR_GAP = 40;
const OVAL_W = 210;
const OVAL_GAP_X = 44;
const OVAL_GAP_Y = 28;
const BOUNDARY_PAD = 36;
const SIDE_GAP = 72;

const LABEL_SIZE = 13;
const DETAIL_SIZE = 11;

const ORPHAN_STROKE = "#b7791f";
const OVAL_STROKE = "#475569";
const OVAL_FILL = "#eef2f7";

function toArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v.filter(Boolean).map(String) : [String(v)];
}

/** Height of an actor block: figure + name + optional detail. */
function actorHeight(label: string[], detail: string[]): number {
  return (
    56 + label.length * lineHeight(LABEL_SIZE) + (detail.length ? detail.length * lineHeight(DETAIL_SIZE) + 4 : 0)
  );
}

function ovalHeight(label: string[], detail: string[], screens: number): number {
  return Math.max(
    72,
    28 + label.length * lineHeight(LABEL_SIZE) + (detail.length ? detail.length * lineHeight(DETAIL_SIZE) + 4 : 0) + (screens ? lineHeight(DETAIL_SIZE) : 0),
  );
}

/**
 * Where a straight line from `from` meets the edge of an ellipse.
 *
 * Without this the association stops at the bounding box corner and leaves a
 * visible gap on every diagonal line — which is most of them, since actors
 * sit above and below the ovals they reach.
 */
function ellipseEdge(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: { x: number; y: number },
): [number, number] {
  const dx = from.x - cx;
  const dy = from.y - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  // Scale the direction vector until it lands on the ellipse.
  const t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  return [Math.round(cx + dx * t), Math.round(cy + dy * t)];
}

export interface UseCaseLayout {
  actors: DrawActor[];
  useCases: DrawUseCase[];
  links: DrawLink[];
  boundary: { x: number; y: number; w: number; h: number; label: string };
  w: number;
  h: number;
}

export function layoutUseCases(
  actors: ActorSpec[],
  useCases: UseCaseSpec[],
  options: UseCaseOptions,
  subtitle: string,
  title: string,
): UseCaseLayout {
  const perColumn = Math.max(
    1,
    typeof options.perColumn === "number" ? Math.floor(options.perColumn) : 6,
  );

  // Measure the ovals first — the boundary is sized around them.
  const measured = useCases.map((uc) => {
    const label = wrapToWidth(uc.label ?? uc.id, OVAL_W - 36, LABEL_SIZE);
    const detail = uc.detail ? wrapToWidth(uc.detail, OVAL_W - 36, DETAIL_SIZE) : [];
    const screens = toArray(uc.screenId);
    return { uc, label, detail, screens, h: ovalHeight(label, detail, screens.length) };
  });

  const columns = Math.max(1, Math.ceil(measured.length / perColumn));
  const rows = Math.ceil(measured.length / columns) || 1;

  // Column-major fill, so a two-column boundary reads top-to-bottom then
  // across — which is how the eye scans a bounded region.
  const colOf = (i: number): number => Math.floor(i / rows);
  const rowOf = (i: number): number => i % rows;

  const rowHeights: number[] = [];
  measured.forEach((m, i) => {
    const r = rowOf(i);
    rowHeights[r] = Math.max(rowHeights[r] ?? 0, m.h);
  });
  const rowY: number[] = [];
  let acc = 0;
  for (let r = 0; r < rows; r++) {
    rowY[r] = acc;
    acc += (rowHeights[r] ?? 0) + OVAL_GAP_Y;
  }
  const innerH = Math.max(0, acc - OVAL_GAP_Y);
  const innerW = columns * OVAL_W + (columns - 1) * OVAL_GAP_X;

  const left = actors.filter((a) => (a.kind ?? "primary") === "primary");
  const right = actors.filter((a) => (a.kind ?? "primary") !== "primary");

  const measureActors = (list: ActorSpec[]): Array<{ a: ActorSpec; label: string[]; detail: string[]; h: number }> =>
    list.map((a) => {
      const label = wrapToWidth(a.label ?? a.id, ACTOR_W, LABEL_SIZE);
      const detail = a.detail ? wrapToWidth(a.detail, ACTOR_W, DETAIL_SIZE) : [];
      return { a, label, detail, h: actorHeight(label, detail) };
    });

  const leftM = measureActors(left);
  const rightM = measureActors(right);
  const stackH = (l: Array<{ h: number }>): number =>
    l.reduce((s, m) => s + m.h, 0) + Math.max(0, l.length - 1) * ACTOR_GAP;

  const boundaryH = innerH + BOUNDARY_PAD * 2 + 24;
  const contentH = Math.max(boundaryH, stackH(leftM), stackH(rightM));

  const frameW =
    PAD_X * 2 +
    (leftM.length ? ACTOR_W + SIDE_GAP : 0) +
    innerW +
    BOUNDARY_PAD * 2 +
    (rightM.length ? SIDE_GAP + ACTOR_W : 0);
  const top = headerHeight(subtitle, frameW);

  const boundaryX = PAD_X + (leftM.length ? ACTOR_W + SIDE_GAP : 0);
  const boundaryY = top + (contentH - boundaryH) / 2;

  // A use case reached only by `include` is factored-out common work, not an
  // orphan: its actor is whoever started the including case, which is why the
  // checker is silent about it. The layout has to agree, or the drawing marks
  // it amber while the report says it is fine — and the drawing is what people
  // look at. Live run caught this: stats.orphans said 2, the checker said 1.
  const included = new Set<string>();
  for (const uc of useCases) for (const inc of uc.includes ?? []) included.add(inc);

  const drawUseCases: DrawUseCase[] = [];
  const centres = new Map<string, { cx: number; cy: number; rx: number; ry: number }>();
  measured.forEach((m, i) => {
    const c = colOf(i);
    const r = rowOf(i);
    const h = rowHeights[r] ?? m.h;
    const x = boundaryX + BOUNDARY_PAD + c * (OVAL_W + OVAL_GAP_X);
    const y = boundaryY + 24 + BOUNDARY_PAD + (rowY[r] ?? 0);
    const orphan = (m.uc.actors?.length ?? 0) === 0 && !included.has(m.uc.id);
    drawUseCases.push({
      id: m.uc.id,
      name: `usecase:${m.uc.id} · ${m.uc.label ?? m.uc.id}`,
      at: { x, y, w: OVAL_W, h },
      label: m.label,
      detail: m.detail,
      ...(m.screens.length ? { screenId: m.screens } : {}),
      orphan,
    });
    centres.set(m.uc.id, { cx: x + OVAL_W / 2, cy: y + h / 2, rx: OVAL_W / 2, ry: h / 2 });
  });

  const drawActors: DrawActor[] = [];
  const place = (
    list: Array<{ a: ActorSpec; label: string[]; detail: string[]; h: number }>,
    x: number,
    anchorSide: "right" | "left",
  ): void => {
    let y = top + (contentH - stackH(list)) / 2;
    for (const m of list) {
      const kind = m.a.kind ?? "primary";
      drawActors.push({
        id: m.a.id,
        name: `actor:${m.a.id} · ${m.a.label ?? m.a.id}`,
        kind,
        at: { x, y, w: ACTOR_W, h: m.h },
        label: m.label,
        detail: m.detail,
        figure: kind === "system" ? "box" : "person",
        anchor: {
          x: anchorSide === "right" ? x + ACTOR_W : x,
          y: Math.round(y + 28),
        },
      });
      y += m.h + ACTOR_GAP;
    }
  };
  place(leftM, PAD_X, "right");
  place(rightM, boundaryX + innerW + BOUNDARY_PAD * 2 + SIDE_GAP, "left");

  const actorById = new Map(drawActors.map((a) => [a.id, a]));

  const links: DrawLink[] = [];
  for (const uc of useCases) {
    const c = centres.get(uc.id);
    if (!c) continue;
    for (const aid of uc.actors ?? []) {
      const a = actorById.get(aid);
      if (!a) continue;
      const end = ellipseEdge(c.cx, c.cy, c.rx, c.ry, a.anchor);
      links.push({
        id: `${aid}->${uc.id}`,
        kind: "association",
        points: [[a.anchor.x, a.anchor.y], end],
        color: INK,
        dashed: false,
      });
    }
    // include: base → included. extend: extension → base. Both dashed.
    for (const inc of uc.includes ?? []) {
      const to = centres.get(inc);
      if (!to) continue;
      links.push(ovalLink(`${uc.id}=include=>${inc}`, "include", c, to, "«include»"));
    }
    for (const ext of uc.extends ?? []) {
      const to = centres.get(ext);
      if (!to) continue;
      links.push(ovalLink(`${uc.id}=extend=>${ext}`, "extend", c, to, "«extend»"));
    }
  }

  return {
    actors: drawActors,
    useCases: drawUseCases,
    links,
    boundary: {
      x: boundaryX,
      y: boundaryY,
      w: innerW + BOUNDARY_PAD * 2,
      h: boundaryH,
      label: options.system || title,
    },
    w: frameW,
    h: top + contentH + PAD_X,
  };
}

function ovalLink(
  id: string,
  kind: "include" | "extend",
  from: { cx: number; cy: number; rx: number; ry: number },
  to: { cx: number; cy: number; rx: number; ry: number },
  stereotype: string,
): DrawLink {
  const start = ellipseEdge(from.cx, from.cy, from.rx, from.ry, { x: to.cx, y: to.cy });
  const end = ellipseEdge(to.cx, to.cy, to.rx, to.ry, { x: from.cx, y: from.cy });
  return {
    id,
    kind,
    points: [start, end],
    color: MUTED,
    dashed: true,
    stereotype,
    at: { x: Math.round((start[0] + end[0]) / 2), y: Math.round((start[1] + end[1]) / 2) },
  };
}

export function emitUseCaseDraw(
  laid: UseCaseLayout,
  frame: {
    title: string;
    subtitle: string;
    name: string;
    x: number;
    y: number;
    parentId?: string;
  },
  options: UseCaseOptions,
): UseCaseDraw {
  return {
    name: frame.name,
    title: frame.title,
    subtitle: frame.subtitle,
    x: frame.x,
    y: frame.y,
    w: laid.w,
    h: laid.h,
    ...(frame.parentId ? { parentId: frame.parentId } : {}),
    boundary: laid.boundary,
    actors: laid.actors,
    useCases: laid.useCases,
    links: laid.links,
    font: options.font || DEFAULT_FONT,
  };
}

export { ellipseEdge, OVAL_STROKE, OVAL_FILL, ORPHAN_STROKE };
