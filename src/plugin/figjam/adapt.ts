/// <reference types="@figma/plugin-typings" />
/**
 * Turning a kind's Design draw-data into the three things FigJam has.
 *
 * Every graph kind in this repo emits the same two shapes without ever
 * having been asked to: an array of boxes carrying `{id, name, at, fill,
 * stroke, title}`, and `edges: DrawEdge[]` whose `id` is `"from->to"`. That
 * is not a coincidence — they all descend from the same `shared/diagram`
 * vocabulary — and it is what lets one adapter serve all of them instead of
 * nine near-identical ones.
 *
 * The edge id is the load-bearing part. On Design an edge carries
 * `points: [[x,y], …]` because something has to draw the line; here the
 * points are thrown away and only the two NODE IDS are kept, because a
 * FigJam connector binds to nodes and routes itself. An adapter that read
 * the points would be reimplementing the router it is supposed to delete.
 */
import type { DrawEdge, Placement, FlowClass } from "../../shared/diagram/types.js";
import type { FigJamBox, FigJamLink } from "./render.js";

/** The common shape every kind's box array already has. */
export interface GraphBox {
  id: string;
  name?: string;
  at: Placement;
  fill?: string;
  stroke?: string;
  title?: string | string[];
  detail?: string | string[];
  kind?: string;
  cls?: FlowClass;
}

function toLines(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];
}

/**
 * Shape per semantic kind.
 *
 * A decision is a DIAMOND and a start/end is an ELLIPSE because that is
 * flowchart convention and FigJam users draw it by hand that way. Getting
 * this wrong is not cosmetic: a diamond is how a reader knows to look for
 * two ways out.
 */
const SHAPE_BY_KIND: Record<string, ShapeWithTextNode["shapeType"]> = {
  decision: "DIAMOND",
  choice: "DIAMOND",
  initial: "ELLIPSE",
  final: "ELLIPSE",
  start: "ELLIPSE",
  end: "ELLIPSE",
  terminal: "ELLIPSE",
  external: "PARALLELOGRAM_RIGHT",
  modal: "SPEECH_BUBBLE",
  section: "SQUARE",
  entity: "ENG_DATABASE",
  usecase: "ELLIPSE",
  actor: "SQUARE",
  note: "SPEECH_BUBBLE",
};

export function shapeFor(kind: string | undefined, cls?: FlowClass): ShapeWithTextNode["shapeType"] {
  if (kind && SHAPE_BY_KIND[kind]) return SHAPE_BY_KIND[kind]!;
  if (cls === "decision") return "DIAMOND";
  return "ROUNDED_RECTANGLE";
}

export interface AdaptOptions {
  /** Layer-name prefix, so a later read can find the node by id. */
  prefix: string;
  /** Extra text lines for a box, beyond title/detail. */
  extra?: (box: GraphBox) => string[];
  /** Push detail into a sticky instead of the shape. */
  detailAsNote?: boolean;
  /** Override the shape for this kind. */
  shape?: (box: GraphBox) => ShapeWithTextNode["shapeType"] | undefined;
}

export function boxesToFigJam(items: GraphBox[], opts: AdaptOptions): FigJamBox[] {
  return items.map((b) => {
    const title = toLines(b.title);
    const detail = toLines(b.detail);
    const extra = opts.extra?.(b) ?? [];
    const label = title.length ? title : [b.id];
    return {
      id: b.id,
      name: b.name ?? `${opts.prefix}:${b.id} · ${label.join(" ")}`,
      at: b.at,
      lines: opts.detailAsNote ? [...label, ...extra] : [...label, ...detail, ...extra],
      shape: opts.shape?.(b) ?? shapeFor(b.kind, b.cls),
      ...(b.fill ? { fill: b.fill } : {}),
      ...(b.stroke ? { stroke: b.stroke } : {}),
      ...(opts.detailAsNote && detail.length ? { note: detail } : {}),
    };
  });
}

/**
 * `"from->to"` back into its two ends.
 *
 * Returns null for an id that is not a pair, which is how a kind with its
 * own edge-id convention (use case writes `a=include=>b`) opts out without
 * this function needing to know about it.
 */
export function splitEdgeId(id: string): { from: string; to: string } | null {
  const i = id.indexOf("->");
  if (i <= 0 || i >= id.length - 2) return null;
  return { from: id.slice(0, i), to: id.slice(i + 2) };
}

export interface LinkOptions {
  /** Containment lines carry no head — see the sitemap handler. */
  arrow?: boolean;
  line?: ConnectorNode["connectorLineType"];
}

export function edgesToFigJam(edges: DrawEdge[], opts: LinkOptions = {}): FigJamLink[] {
  const out: FigJamLink[] = [];
  for (const e of edges) {
    const ends = splitEdgeId(e.id);
    if (!ends) continue;
    out.push({
      id: e.id,
      from: ends.from,
      to: ends.to,
      ...(e.label?.text ? { label: e.label.text } : {}),
      ...(e.dashed ? { dashed: true } : {}),
      ...(e.color ? { color: e.color } : {}),
      ...(opts.line ? { line: opts.line } : {}),
      ...(opts.arrow === false ? { arrow: false } : {}),
    });
  }
  return out;
}
