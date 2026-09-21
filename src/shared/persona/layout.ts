/**
 * Persona layout: measure every card, take the tallest, draw a grid.
 *
 * Uniform card height rather than ragged, and it is not a taste call: a
 * persona set is read by comparing the SAME row across two cards — "what does
 * she want, what does he want" — and ragged tops put those rows at different
 * heights, which is exactly the comparison the artefact exists to support.
 *
 * Everything is measured here and drawn by the plugin. Same split as every
 * other kind: nothing in this file touches a Figma runtime, so the geometry
 * is testable without one.
 */
import { lineHeight, wrapToWidth, headerHeight } from "../diagram/metrics.js";
import { DEFAULT_FONT, PALETTE } from "../diagram/palette.js";
import type {
  DrawPersona,
  DrawSection,
  PersonaDraw,
  PersonaOptions,
  PersonaRole,
  PersonaSpec,
} from "./types.js";

const CARD_W = 300;
const GAP = 24;
const PAD_X = 32;
const PAD_IN = 18;
const AVATAR = 44;

const NAME_SIZE = 16;
const TITLE_SIZE = 12;
const QUOTE_SIZE = 13;
const LABEL_SIZE = 11;
const ITEM_SIZE = 12;

/** Accent per role. Negative personas are red because they are a boundary. */
const ACCENT: Record<PersonaRole, string> = {
  primary: "#2563eb",
  secondary: "#0891b2",
  served: "#7c3aed",
  negative: "#c0392b",
};

const ROLE_LABEL: Record<PersonaRole, string> = {
  primary: "PRIMARY",
  secondary: "SECONDARY",
  served: "SERVED",
  negative: "NOT FOR",
};

/** Two initials, from a name or failing that the id. */
export function initialsOf(name: string, id: string): string {
  const src = (name || id).trim();
  const words = src.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  // Last word first for CJK-ordered names is wrong as often as it is right,
  // so: first letter of the first and the last word, which reads correctly
  // for "Nguyễn Văn An" (NA) and for "Anna Schmidt" (AS) alike.
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

function toArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v.filter(Boolean).map(String) : [String(v)];
}

interface MeasuredSection extends DrawSection {
  height: number;
}

/** Wrap one titled block and measure it. */
function section(
  label: string,
  items: string[] | undefined,
  innerW: number,
  muted: boolean,
): MeasuredSection | null {
  if (!items || items.length === 0) return null;
  const wrapped = items.map((i) => wrapToWidth(`• ${i}`, innerW, ITEM_SIZE));
  const lines = wrapped.reduce((a, w) => a + w.length, 0);
  return {
    label,
    items: wrapped,
    muted,
    height: lineHeight(LABEL_SIZE) + 4 + lines * lineHeight(ITEM_SIZE) + 10,
  };
}

interface Measured {
  persona: DrawPersona;
  height: number;
}

function measure(p: PersonaSpec): Measured {
  const innerW = CARD_W - PAD_IN * 2;
  const role: PersonaRole = p.role ?? "secondary";
  const displayName = (p.name ?? p.id).trim();
  const title = (p.title ?? "").trim();

  const quote = p.quote ? wrapToWidth(`“${p.quote}”`, innerW, QUOTE_SIZE) : [];
  const scenario = p.scenario ? wrapToWidth(p.scenario, innerW, ITEM_SIZE) : [];

  // Order is the argument the card makes: what they want, what stops them,
  // what they do about it today, what they use. Demographics last, because
  // they are the least useful thing on the card and going first is what makes
  // a persona decorative.
  const demo = Object.entries(p.demographics ?? {}).map(([k, v]) => `${k}: ${v}`);
  const sections = [
    section("GOALS", p.goals, innerW, false),
    section("FRUSTRATIONS", p.frustrations, innerW, false),
    section("BEHAVIOURS TODAY", p.behaviours, innerW, true),
    section("TOOLS", p.tools, innerW, true),
    section("ABOUT", demo.length ? demo : undefined, innerW, true),
  ].filter((s): s is MeasuredSection => s !== null);

  const screenId = toArray(p.screenId);

  let h = PAD_IN;
  h += Math.max(AVATAR, lineHeight(NAME_SIZE) + (title ? lineHeight(TITLE_SIZE) : 0));
  if (screenId.length) h += lineHeight(LABEL_SIZE);
  h += 12;
  if (quote.length) h += quote.length * lineHeight(QUOTE_SIZE) + 14;
  if (scenario.length) h += scenario.length * lineHeight(ITEM_SIZE) + 12;
  for (const s of sections) h += s.height;
  h += PAD_IN;

  const palette = PALETTE[p.cls ?? "plain"];
  return {
    height: Math.round(h),
    persona: {
      id: p.id,
      name: `persona:${p.id} · ${displayName}`,
      at: { x: 0, y: 0, w: CARD_W, h: 0 },
      fill: palette.fill,
      stroke: palette.stroke === "#000f22" ? "#dfe4ea" : palette.stroke,
      accent: ACCENT[role],
      role,
      roleLabel: ROLE_LABEL[role],
      initials: initialsOf(displayName, p.id),
      displayName,
      title,
      quote,
      scenario,
      sections: sections.map(({ height: _h, ...rest }) => rest),
      ...(screenId.length ? { screenId } : {}),
    },
  };
}

export interface PersonaLayout {
  personas: DrawPersona[];
  w: number;
  h: number;
  columns: number;
}

export function layoutPersonas(
  personas: PersonaSpec[],
  options: PersonaOptions,
  subtitle: string,
): PersonaLayout {
  const measured = personas.map(measure);
  const columns = Math.max(
    1,
    Math.min(
      typeof options.columns === "number" ? Math.floor(options.columns) : 3,
      Math.max(1, measured.length),
    ),
  );

  // One height for every card — see the header comment.
  const cardH = measured.reduce((a, m) => Math.max(a, m.height), 0);
  const rows = Math.ceil(measured.length / columns);
  const gridW = columns * CARD_W + (columns - 1) * GAP;
  const top = headerHeight(subtitle, gridW + PAD_X * 2);

  measured.forEach((m, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    m.persona.at = {
      x: PAD_X + col * (CARD_W + GAP),
      y: top + row * (cardH + GAP),
      w: CARD_W,
      h: cardH,
    };
  });

  return {
    personas: measured.map((m) => m.persona),
    columns,
    w: gridW + PAD_X * 2,
    h: top + rows * cardH + (rows - 1) * GAP + PAD_X,
  };
}

export function emitPersonaDraw(
  laid: PersonaLayout,
  frame: {
    title: string;
    subtitle: string;
    name: string;
    x: number;
    y: number;
    parentId?: string;
  },
  options: PersonaOptions,
): PersonaDraw {
  return {
    name: frame.name,
    title: frame.title,
    subtitle: frame.subtitle,
    x: frame.x,
    y: frame.y,
    w: laid.w,
    h: laid.h,
    ...(frame.parentId ? { parentId: frame.parentId } : {}),
    personas: laid.personas,
    font: options.font || DEFAULT_FONT,
  };
}
