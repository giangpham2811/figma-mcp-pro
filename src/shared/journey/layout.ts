/**
 * Journey layout: a grid of stages × lanes, with the emotion curve drawn
 * through the middle of it.
 *
 * Every lane gets the height its tallest cell needs, and every stage column
 * is the same width. That is the opposite of the persona grid's reasoning
 * and for the same underlying rule: the comparison this artefact supports is
 * ACROSS a lane ("where does it hurt?"), so lanes must line up horizontally,
 * while column heights are free to be whatever the content needs.
 *
 * The emotion band sits between the top lanes and the bottom ones rather
 * than at the end, because it is the summary the eye should hit on the way
 * down — a curve parked under six rows of bullets is a footnote.
 */
import { lineHeight, wrapToWidth, headerHeight } from "../diagram/metrics.js";
import { DEFAULT_FONT } from "../diagram/palette.js";
import type {
  DrawCell,
  DrawLane,
  DrawStage,
  Feeling,
  JourneyDraw,
  JourneyOptions,
  StageSpec,
} from "./types.js";

const GUTTER = 132;
const PAD_X = 32;
const GAP = 12;
const CELL_PAD = 10;
const BAND_H = 132;

const LABEL_SIZE = 11;
const STAGE_SIZE = 13;
const ITEM_SIZE = 12;

/** The lanes, in reading order. `before` lanes sit above the emotion band. */
const LANES: Array<{
  key: keyof StageSpec & ("doing" | "touchpoints" | "thinking" | "pains" | "opportunities");
  label: string;
  muted: boolean;
  before: boolean;
  accent?: string;
}> = [
  { key: "doing", label: "DOING", muted: false, before: true },
  { key: "touchpoints", label: "TOUCHPOINTS", muted: true, before: true },
  { key: "thinking", label: "THINKING", muted: true, before: true },
  { key: "pains", label: "PAIN POINTS", muted: false, before: false, accent: "#c0392b" },
  { key: "opportunities", label: "OPPORTUNITIES", muted: false, before: false, accent: "#1e8e5a" },
];

/** Feeling → the colour of its dot. Red at the bottom, green at the top. */
const FEELING_COLOR: Record<Feeling, string> = {
  [-2]: "#c0392b",
  [-1]: "#d97706",
  0: "#5b6675",
  1: "#2563eb",
  2: "#1e8e5a",
};

function toArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v.filter(Boolean).map(String) : [String(v)];
}

function cell(items: string[] | undefined, innerW: number): { cell: DrawCell; lines: number } {
  if (!items || items.length === 0) {
    return { cell: { items: [], empty: true }, lines: 1 };
  }
  const wrapped = items.map((i) => wrapToWidth(`• ${i}`, innerW, ITEM_SIZE));
  return { cell: { items: wrapped, empty: false }, lines: wrapped.reduce((a, w) => a + w.length, 0) };
}

export interface JourneyLayout {
  stages: DrawStage[];
  lanes: DrawLane[];
  curve: Array<[number, number]>;
  gutter: number;
  band: { y: number; h: number };
  w: number;
  h: number;
}

export function layoutJourney(
  stages: StageSpec[],
  options: JourneyOptions,
  subtitle: string,
): JourneyLayout {
  const colW = Math.max(
    150,
    typeof options.columnWidth === "number" ? Math.floor(options.columnWidth) : 220,
  );
  const innerW = colW - CELL_PAD * 2;
  const n = Math.max(1, stages.length);

  // Measure every cell first: a lane's height is its tallest cell.
  const cells = stages.map((s) => LANES.map((l) => cell(s[l.key] as string[] | undefined, innerW)));
  const laneLines = LANES.map((_, li) => cells.reduce((a, row) => Math.max(a, row[li]!.lines), 1));
  const laneHeights = laneLines.map((l) => l * lineHeight(ITEM_SIZE) + CELL_PAD * 2);

  const gridW = GUTTER + n * colW + (n - 1) * GAP;
  const frameW = gridW + PAD_X * 2;
  const top = headerHeight(subtitle, frameW);

  // Stage header strip, then the lanes above the band, then the band, then
  // the lanes below it.
  const headerH = Math.max(
    lineHeight(STAGE_SIZE) * 2 + CELL_PAD * 2,
    lineHeight(STAGE_SIZE) + CELL_PAD * 2,
  );
  let y = top + headerH + GAP;

  const lanes: DrawLane[] = [];
  LANES.forEach((l, li) => {
    if (!l.before) return;
    lanes.push({
      key: l.key,
      label: l.label,
      y,
      h: laneHeights[li]!,
      muted: l.muted,
      ...(l.accent ? { accent: l.accent } : {}),
    });
    y += laneHeights[li]! + GAP;
  });

  const showCurve = options.emotionCurve !== false;
  const band = { y, h: showCurve ? BAND_H : 0 };
  if (showCurve) y += BAND_H + GAP;

  LANES.forEach((l, li) => {
    if (l.before) return;
    lanes.push({
      key: l.key,
      label: l.label,
      y,
      h: laneHeights[li]!,
      muted: l.muted,
      ...(l.accent ? { accent: l.accent } : {}),
    });
    y += laneHeights[li]! + GAP;
  });

  // Place the stages and their emotion dots.
  const curve: Array<[number, number]> = [];
  const drawStages: DrawStage[] = stages.map((s, i) => {
    const x = PAD_X + GUTTER + i * (colW + GAP);
    const feeling = (s.feeling ?? 0) as Feeling;
    // -2 at the bottom of the band, +2 at the top.
    const dotY = band.y + BAND_H / 2 - (feeling / 2) * (BAND_H / 2 - 18);
    const dot = { x: x + colW / 2, y: Math.round(dotY) };
    if (showCurve) curve.push([dot.x, dot.y]);
    const screenId = toArray(s.screenId);

    return {
      id: s.id,
      name: `stage:${s.id} · ${s.label ?? s.id}`,
      at: { x, y: top, w: colW, h: headerH },
      label: wrapToWidth(s.label ?? s.id, innerW, STAGE_SIZE),
      index: i + 1,
      feeling,
      dot,
      fill: "#f6f8fa",
      stroke: FEELING_COLOR[feeling],
      ...(screenId.length ? { screenId } : {}),
      cells: cells[i]!.map((c) => c.cell),
    };
  });

  return {
    stages: drawStages,
    lanes,
    curve,
    gutter: GUTTER,
    band,
    w: frameW,
    h: y - GAP + PAD_X,
  };
}

export function emitJourneyDraw(
  laid: JourneyLayout,
  frame: {
    title: string;
    subtitle: string;
    persona: string;
    name: string;
    x: number;
    y: number;
    parentId?: string;
  },
  options: JourneyOptions,
): JourneyDraw {
  return {
    name: frame.name,
    title: frame.title,
    subtitle: frame.subtitle,
    persona: frame.persona,
    x: frame.x,
    y: frame.y,
    w: laid.w,
    h: laid.h,
    ...(frame.parentId ? { parentId: frame.parentId } : {}),
    stages: laid.stages,
    lanes: laid.lanes,
    curve: laid.curve,
    gutter: laid.gutter,
    band: laid.band,
    font: options.font || DEFAULT_FONT,
  };
}

export { LANES, FEELING_COLOR, LABEL_SIZE };
