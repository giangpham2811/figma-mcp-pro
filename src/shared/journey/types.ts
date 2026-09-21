/**
 * Journey map: what a person does over time, and how it feels.
 *
 * The distinction that decides this file's shape, because conflating the two
 * is how a journey map becomes a second, worse userflow:
 *
 *   A userflow edge is a SCREEN TRANSITION — the product's geography.
 *   A journey stage is a PHASE OF INTENT — the person's experience, which
 *   includes the parts that happen nowhere near the product. "Asks a
 *   colleague whether this is worth doing" is a stage; it has no screen.
 *
 * So there are no edges here at all. Stages are ordered by their position in
 * the array and nothing else, and a stage is not required to have a
 * touchpoint — a stage with none is the interesting finding, not an error.
 *
 * The emotion track is the reason this artefact exists rather than being a
 * table. It is a small integer on purpose: research gives you "frustrated"
 * and "relieved", not 7.4.
 */
import type { Placement, DrawFrameExtras } from "../diagram/types.js";

export type { Placement } from "../diagram/types.js";

/**
 * -2 despairing, -1 annoyed, 0 neutral, 1 pleased, 2 delighted.
 *
 * Five steps, because a scale finer than that invites made-up precision and
 * the checker cannot tell invented numbers from measured ones.
 */
export type Feeling = -2 | -1 | 0 | 1 | 2;

export interface StageSpec {
  id: string;
  /** The phase in the person's words: "Chờ mọi người trả tiền". */
  label?: string;
  /** What they DO. Actions, not features. */
  doing?: string[];
  /**
   * Where the product (or the business) meets them: a screen, an email, a
   * phone call, a paper form. A stage with none is a gap nobody is serving,
   * which is precisely what a journey map is drawn to find.
   */
  touchpoints?: string[];
  /** What they are thinking or asking themselves. Quotes if you have them. */
  thinking?: string[];
  feeling?: Feeling;
  /** What hurts here. */
  pains?: string[];
  /** What could be done about it. The half most journey maps skip. */
  opportunities?: string[];
  /** Artboard(s) that design this stage, for the coverage cross-check. */
  screenId?: string | string[];
}

export interface JourneyOptions {
  font?: string;
  /** Column width. Default 220 — narrower and the bullets stop wrapping well. */
  columnWidth?: number;
  /** Draw the emotion curve. Default true; false gives a plain table. */
  emotionCurve?: boolean;
  policies?: Record<string, string | number>;
  dryRun?: boolean;
}

export interface JourneySpec {
  /** The compact line form — use this OR `stages`. */
  text?: string;
  title: string;
  subtitle?: string;
  /** The persona id this journey is for, so the two artefacts can be joined. */
  persona?: string;
  parentId?: string;
  x?: number;
  y?: number;
  stages?: StageSpec[];
  options?: JourneyOptions;
}

// ---- draw data ----

/** One cell of the grid: a lane's content for one stage. */
export interface DrawCell {
  /** Already wrapped to the column's inner width. */
  items: string[][];
  /** Empty cells are drawn as a faint dash, not left blank. */
  empty: boolean;
}

export interface DrawStage {
  id: string;
  /** Layer name: `stage:<id> · <label>`. */
  name: string;
  at: Placement;
  label: string[];
  index: number;
  feeling: Feeling;
  /** Where the emotion dot sits, in frame coordinates. */
  dot: { x: number; y: number };
  fill: string;
  stroke: string;
  screenId?: string[];
  cells: DrawCell[];
}

export interface DrawLane {
  key: string;
  label: string;
  y: number;
  h: number;
  /** Supporting lanes are drawn quieter than Doing and Opportunities. */
  muted: boolean;
  /** Pains lane is red, opportunities green — they are a verdict, not data. */
  accent?: string;
}

export interface JourneyDraw extends DrawFrameExtras {
  name: string;
  title: string;
  subtitle: string;
  persona: string;
  x: number;
  y: number;
  w: number;
  h: number;
  parentId?: string;
  stages: DrawStage[];
  lanes: DrawLane[];
  /** The emotion polyline in frame coordinates; empty when switched off. */
  curve: Array<[number, number]>;
  /** Left gutter where the lane labels go. */
  gutter: number;
  /** The emotion band's top and height, for the axis rules. */
  band: { y: number; h: number };
  font: string;
}

export interface JourneyBuild {
  draw: JourneyDraw;
  model: JourneySpec;
  warnings: string[];
  stats: {
    stages: number;
    /** Stages with at least one touchpoint. */
    served: number;
    pains: number;
    opportunities: number;
    /** Lowest feeling on the journey — the moment to fix first. */
    low: Feeling;
    w: number;
    h: number;
  };
}
