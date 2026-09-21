/**
 * The ten visual styles, and the token set each one produces.
 *
 * A "style" here is not a palette swap. Ten hues with the same 8px radius and
 * the same soft shadow is one design system photographed ten times, and that
 * is what most generators ship. These differ in the things that actually make
 * two products look unrelated: corner geometry, whether a surface is defined
 * by a border or a shadow or neither, stroke weight, type family, and density.
 * Colour is the last of the five, not the first.
 *
 * Everything in this file is pure. The plugin draws from it, the server
 * validates against it, and the tests check the contrast maths without a
 * Figma runtime anywhere near them.
 */
import {
  RAMP_STEPS,
  buildRamp,
  readableOn,
  contrastRatio,
  lightestPassing,
  actionPair,
  SEMANTIC_HUES,
  type Ramp,
} from "./color.js";

/** How a surface is separated from the thing behind it. */
export type SurfaceStrategy = "border" | "shadow" | "both" | "flat" | "glass";

export interface ShadowSpec {
  type: "DROP_SHADOW" | "INNER_SHADOW";
  x: number;
  y: number;
  blur: number;
  spread?: number;
  /** Hex with alpha baked in as the `alpha` field, since Figma wants both. */
  color: string;
  alpha: number;
}

export interface StyleRecipe {
  id: string;
  label: string;
  /** One line, shown in the generated DESIGN.md. */
  note: string;

  /** Saturation at ramp step 500 for the brand ramp (0–100). */
  chroma: number;
  /** Saturation for the neutral ramp. Above ~8 the greys read as tinted. */
  neutralChroma: number;
  /** Hue offset applied to the neutral ramp, so greys relate to the brand. */
  neutralHueShift: number;
  /** Generate dark mode as the primary mode rather than the secondary. */
  darkFirst: boolean;

  /** Corner radii, px. `full` is the pill/circle value. */
  radius: { sm: number; md: number; lg: number; full: number };
  borderWidth: number;
  /** Focus ring width — never below 2, see FOCUS_RING_MIN. */
  focusRing: number;
  surface: SurfaceStrategy;
  /** Elevation levels. An empty array means the style does not use shadow. */
  shadows: { sm: ShadowSpec[]; md: ShadowSpec[]; lg: ShadowSpec[] };

  font: { sans: string; display: string; mono: string };
  /** Ratio between type-scale steps. 1.2 is tight, 1.333 is editorial. */
  typeScale: number;
  baseFontSize: number;
  /** Multiplier on the 4px spacing scale. 0.75 is dense, 1.25 is airy. */
  density: number;
  /** Text case for buttons and labels — some styles shout. */
  buttonCase: "none" | "upper";
  letterSpacingTight: number;
}

const NO_SHADOW = { sm: [], md: [], lg: [] };

/**
 * Ramp order for a dark background: light steps first, because "lightest
 * that passes" means the step CLOSEST TO THE BACKGROUND that still clears the
 * ratio, and on a near-black surface that is the pale end.
 */
const REVERSED = [950, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50] as const;

/** Preferred steps for an action surface, best-looking first. */
const ACTION_LIGHT = [600, 700, 800, 900] as const;
const ACTION_DARK = [500, 400, 300, 600] as const;

function drop(
  y: number,
  blur: number,
  alpha: number,
  x = 0,
  spread = 0,
  color = "#000000",
): ShadowSpec {
  return { type: "DROP_SHADOW", x, y, blur, spread, color, alpha };
}

/**
 * A focus ring below 2px disappears against a border of the same colour, and
 * it is the one affordance a keyboard user has. No recipe may go under it —
 * see "When NOT to be lazy": accessibility basics are not a style choice.
 */
export const FOCUS_RING_MIN = 2;

export const STYLES: Record<string, StyleRecipe> = {
  neutral: {
    id: "neutral",
    label: "Neutral / Swiss",
    note: "Restrained. Borders define surfaces, no shadow, tight radii. The safe default.",
    chroma: 62,
    neutralChroma: 4,
    neutralHueShift: 0,
    darkFirst: false,
    radius: { sm: 4, md: 6, lg: 8, full: 999 },
    borderWidth: 1,
    focusRing: 2,
    surface: "border",
    shadows: NO_SHADOW,
    font: { sans: "Inter", display: "Inter", mono: "Roboto Mono" },
    typeScale: 1.2,
    baseFontSize: 14,
    density: 1,
    buttonCase: "none",
    letterSpacingTight: -0.01,
  },

  soft: {
    id: "soft",
    label: "Soft / Rounded",
    note: "Generous radii, soft diffuse shadows, no borders. Reads friendly and modern.",
    chroma: 70,
    neutralChroma: 6,
    neutralHueShift: -10,
    darkFirst: false,
    radius: { sm: 8, md: 14, lg: 22, full: 999 },
    borderWidth: 0,
    focusRing: 3,
    surface: "shadow",
    shadows: {
      sm: [drop(1, 3, 0.08), drop(1, 2, 0.06)],
      md: [drop(4, 12, 0.08), drop(2, 4, 0.06)],
      lg: [drop(12, 32, 0.12), drop(4, 8, 0.06)],
    },
    font: { sans: "Inter", display: "Poppins", mono: "Roboto Mono" },
    typeScale: 1.25,
    baseFontSize: 15,
    density: 1.15,
    buttonCase: "none",
    letterSpacingTight: -0.015,
  },

  brutalist: {
    id: "brutalist",
    label: "Brutalist",
    note: "Zero radius, 2px black borders, hard offset shadows with no blur. Loud on purpose.",
    chroma: 88,
    neutralChroma: 0,
    neutralHueShift: 0,
    darkFirst: false,
    radius: { sm: 0, md: 0, lg: 0, full: 0 },
    borderWidth: 2,
    focusRing: 3,
    surface: "both",
    shadows: {
      // No blur. The shadow is a second rectangle, which is the whole look.
      sm: [drop(2, 0, 1, 2)],
      md: [drop(4, 0, 1, 4)],
      lg: [drop(8, 0, 1, 8)],
    },
    font: { sans: "Space Grotesk", display: "Space Grotesk", mono: "Space Mono" },
    typeScale: 1.333,
    baseFontSize: 15,
    density: 1,
    buttonCase: "upper",
    letterSpacingTight: 0,
  },

  glass: {
    id: "glass",
    label: "Glass",
    note: "Translucent surfaces, background blur, hairline light borders. Needs imagery behind it.",
    chroma: 72,
    neutralChroma: 8,
    neutralHueShift: 220,
    darkFirst: true,
    radius: { sm: 10, md: 16, lg: 24, full: 999 },
    borderWidth: 1,
    focusRing: 2,
    surface: "glass",
    shadows: {
      sm: [drop(2, 8, 0.2)],
      md: [drop(8, 24, 0.28)],
      lg: [drop(16, 48, 0.36)],
    },
    font: { sans: "Inter", display: "Inter", mono: "Roboto Mono" },
    typeScale: 1.25,
    baseFontSize: 14,
    density: 1.1,
    buttonCase: "none",
    letterSpacingTight: -0.01,
  },

  editorial: {
    id: "editorial",
    label: "Editorial",
    note: "Serif display, hairline rules, a lot of air. Built for reading, not for dashboards.",
    chroma: 45,
    neutralChroma: 5,
    neutralHueShift: 30,
    darkFirst: false,
    radius: { sm: 2, md: 3, lg: 4, full: 999 },
    borderWidth: 1,
    focusRing: 2,
    surface: "border",
    shadows: NO_SHADOW,
    font: { sans: "Inter", display: "Playfair Display", mono: "IBM Plex Mono" },
    typeScale: 1.333,
    baseFontSize: 16,
    density: 1.35,
    buttonCase: "none",
    letterSpacingTight: -0.02,
  },

  corporate: {
    id: "corporate",
    label: "Corporate",
    note: "Tight density, small radii, subtle elevation. Made for data-heavy screens.",
    chroma: 58,
    neutralChroma: 6,
    neutralHueShift: 215,
    darkFirst: false,
    radius: { sm: 3, md: 4, lg: 6, full: 999 },
    borderWidth: 1,
    focusRing: 2,
    surface: "both",
    shadows: {
      sm: [drop(1, 2, 0.06)],
      md: [drop(2, 6, 0.08)],
      lg: [drop(6, 16, 0.1)],
    },
    font: { sans: "Inter", display: "Inter", mono: "Roboto Mono" },
    typeScale: 1.2,
    baseFontSize: 13,
    density: 0.8,
    buttonCase: "none",
    letterSpacingTight: 0,
  },

  playful: {
    id: "playful",
    label: "Playful",
    note: "Pill shapes, saturated colour, coloured shadows. Consumer apps, not admin panels.",
    chroma: 92,
    neutralChroma: 10,
    neutralHueShift: -20,
    darkFirst: false,
    radius: { sm: 12, md: 20, lg: 28, full: 999 },
    borderWidth: 0,
    focusRing: 3,
    surface: "shadow",
    shadows: {
      sm: [drop(2, 6, 0.16)],
      md: [drop(6, 16, 0.2)],
      lg: [drop(14, 36, 0.24)],
    },
    font: { sans: "Nunito", display: "Fredoka", mono: "Roboto Mono" },
    typeScale: 1.25,
    baseFontSize: 15,
    density: 1.2,
    buttonCase: "none",
    letterSpacingTight: -0.01,
  },

  dark: {
    id: "dark",
    label: "Dark-first",
    note: "Designed dark, light mode derived. Luminous borders instead of shadows.",
    chroma: 75,
    neutralChroma: 7,
    neutralHueShift: 240,
    darkFirst: true,
    radius: { sm: 6, md: 10, lg: 14, full: 999 },
    borderWidth: 1,
    focusRing: 2,
    surface: "border",
    shadows: {
      sm: [drop(0, 0, 0.5, 0, 1, "#ffffff")],
      md: [drop(4, 16, 0.5)],
      lg: [drop(12, 40, 0.6)],
    },
    font: { sans: "Inter", display: "Inter", mono: "JetBrains Mono" },
    typeScale: 1.25,
    baseFontSize: 14,
    density: 1,
    buttonCase: "none",
    letterSpacingTight: -0.01,
  },

  highContrast: {
    id: "highContrast",
    label: "High contrast / a11y-first",
    note: "AAA text contrast, 2px borders everywhere, 3px focus ring. Nothing relies on colour alone.",
    chroma: 80,
    neutralChroma: 0,
    neutralHueShift: 0,
    darkFirst: false,
    radius: { sm: 4, md: 6, lg: 8, full: 999 },
    borderWidth: 2,
    focusRing: 3,
    surface: "border",
    shadows: NO_SHADOW,
    font: { sans: "Atkinson Hyperlegible", display: "Atkinson Hyperlegible", mono: "Roboto Mono" },
    typeScale: 1.25,
    baseFontSize: 16,
    density: 1.2,
    buttonCase: "none",
    letterSpacingTight: 0,
  },

  neumorphic: {
    id: "neumorphic",
    label: "Neumorphic",
    note: "Surfaces extruded from one background with paired light/dark shadows. Low contrast by nature — the audit will say so.",
    chroma: 50,
    neutralChroma: 8,
    neutralHueShift: 225,
    darkFirst: false,
    radius: { sm: 10, md: 16, lg: 24, full: 999 },
    borderWidth: 0,
    focusRing: 3,
    surface: "flat",
    shadows: {
      sm: [drop(2, 4, 0.1, 2), drop(-2, 4, 0.9, -2, 0, "#ffffff")],
      md: [drop(6, 12, 0.12, 6), drop(-6, 12, 0.9, -6, 0, "#ffffff")],
      lg: [drop(12, 24, 0.14, 12), drop(-12, 24, 0.9, -12, 0, "#ffffff")],
    },
    font: { sans: "Inter", display: "Inter", mono: "Roboto Mono" },
    typeScale: 1.2,
    baseFontSize: 14,
    density: 1.15,
    buttonCase: "none",
    letterSpacingTight: -0.01,
  },
};

export const STYLE_IDS = Object.keys(STYLES);

/** A token value that differs per mode. */
export type ModalColor = string | { light: string; dark: string };

export interface TokenSet {
  colors: Record<string, ModalColor>;
  numbers: Record<string, number>;
  strings: Record<string, string>;
}

export interface GenerateOptions {
  /** Brand hue, 0–360. */
  hue?: number;
  /** Override the recipe's chroma. */
  chroma?: number;
  /** Emit light+dark values for every colour token. */
  modes?: boolean;
}

/** The type scale, in steps up from the base size. */
export function typeScale(recipe: StyleRecipe): Record<string, number> {
  const r = recipe.typeScale;
  const b = recipe.baseFontSize;
  const at = (n: number): number => Math.round(b * Math.pow(r, n));
  return {
    xs: Math.round(b / r),
    sm: Math.round(b / Math.pow(r, 0.5)),
    base: b,
    lg: at(1),
    xl: at(2),
    "2xl": at(3),
    "3xl": at(4),
    "4xl": at(5),
  };
}

/** The 4px spacing scale, scaled by the recipe's density. */
export function spacingScale(recipe: StyleRecipe): Record<string, number> {
  const d = recipe.density;
  const step = (n: number): number => Math.max(2, Math.round((n * d) / 2) * 2);
  return {
    "0": 0,
    "1": step(4),
    "2": step(8),
    "3": step(12),
    "4": step(16),
    "5": step(24),
    "6": step(32),
    "7": step(48),
    "8": step(64),
  };
}

/**
 * Pick the pair of ramp steps that carry a surface and its text in one mode.
 *
 * Light mode reads darker text on a lighter surface; dark mode inverts. Doing
 * it by index into the ramp rather than by hardcoded hex is what keeps the
 * dark mode of a generated system from being a separate design nobody checked.
 */
function surfacePair(
  ramp: Ramp,
  dark: boolean,
): { bg: string; fg: string; subtle: string; border: string } {
  return dark
    ? { bg: ramp[950], fg: ramp[50], subtle: ramp[900], border: ramp[800] }
    : { bg: "#ffffff", fg: ramp[950], subtle: ramp[50], border: ramp[200] };
}

function pair(light: string, dark: string, modes: boolean): ModalColor {
  return modes ? { light, dark } : light;
}

/**
 * Build the whole token set for a style.
 *
 * Token names are flat and slash-separated because that is what Figma
 * Variables groups on, and what `setup_tokens` already understands. Every
 * `*-on` token is MEASURED against its background rather than assumed — a
 * generated palette that fails contrast on its own primary button is the
 * single most common defect in this category of tool.
 */
export function buildTokens(
  recipe: StyleRecipe,
  opts: GenerateOptions = {},
): TokenSet {
  const hue = opts.hue ?? 250;
  const chroma = opts.chroma ?? recipe.chroma;
  const modes = opts.modes !== false;

  const brand = buildRamp(hue, chroma);
  const neutral = buildRamp(hue + recipe.neutralHueShift, recipe.neutralChroma);
  const success = buildRamp(SEMANTIC_HUES.success, chroma * 0.85);
  const warning = buildRamp(SEMANTIC_HUES.warning, chroma * 0.95);
  const danger = buildRamp(SEMANTIC_HUES.danger, chroma * 0.95);
  const info = buildRamp(SEMANTIC_HUES.info, chroma * 0.85);

  const colors: Record<string, ModalColor> = {};

  // Raw ramps, so a designer can reach past the semantic layer.
  const ramps: Array<[string, Ramp]> = [
    ["brand", brand],
    ["neutral", neutral],
    ["success", success],
    ["warning", warning],
    ["danger", danger],
    ["info", info],
  ];
  for (const [name, ramp] of ramps) {
    for (const step of Object.keys(ramp) as Array<keyof Ramp>) {
      colors[`color/${name}/${step}`] = ramp[step];
    }
  }

  // Semantic surfaces, per mode.
  const L = surfacePair(neutral, false);
  const D = surfacePair(neutral, true);
  colors["color/bg/base"] = pair(L.bg, D.bg, modes);
  colors["color/bg/subtle"] = pair(L.subtle, D.subtle, modes);
  colors["color/bg/raised"] = pair("#ffffff", neutral[900], modes);
  // Two borders, because WCAG treats them differently and collapsing them
  // gets one of the two wrong. A divider between cards is decoration and may
  // be as quiet as it likes; the edge of an input is how a user finds the
  // input, and 1.4.11 wants 3:1 for that. Shipping one token forces a choice
  // between ugly dividers and unfindable fields.
  colors["color/border/default"] = pair(L.border, D.border, modes);
  colors["color/border/strong"] = pair(
    lightestPassing(neutral, L.bg, 3),
    lightestPassing(neutral, D.bg, 3, REVERSED),
    modes,
  );
  colors["color/text/primary"] = pair(L.fg, D.fg, modes);
  // Measured, not step 600: see lightestPassing.
  colors["color/text/secondary"] = pair(
    lightestPassing(neutral, L.bg, 4.5),
    lightestPassing(neutral, D.bg, 4.5, REVERSED),
    modes,
  );
  colors["color/text/disabled"] = pair(neutral[400], neutral[600], modes);

  // Action colours and the text that sits ON them. Measured, not guessed.
  const actions: Array<[string, Ramp]> = [
    ["primary", brand],
    ["success", success],
    ["warning", warning],
    ["danger", danger],
    ["info", info],
  ];
  for (const [role, ramp] of actions) {
    // Preference order, not a fixed step: 600 is the look we want in light
    // mode, and darker steps are where it goes when 600 cannot carry legible
    // text. Dark mode starts at 500 and goes LIGHTER for the same reason.
    const light = actionPair(ramp, ACTION_LIGHT);
    const dark = actionPair(ramp, ACTION_DARK);
    // Hover/active track whichever step was chosen, so a palette that had to
    // drop to 700 does not hover into the same colour it already is.
    const shift = (base: string, by: number, r: Ramp): string => {
      const steps = RAMP_STEPS;
      const i = steps.findIndex((sp) => r[sp] === base);
      const j = Math.max(0, Math.min(steps.length - 1, i + by));
      return r[steps[j]!];
    };
    colors[`color/${role}/default`] = pair(light.bg, dark.bg, modes);
    colors[`color/${role}/hover`] = pair(shift(light.bg, 1, ramp), shift(dark.bg, -1, ramp), modes);
    colors[`color/${role}/active`] = pair(shift(light.bg, 2, ramp), shift(dark.bg, -2, ramp), modes);
    colors[`color/${role}/subtle`] = pair(ramp[50], ramp[950], modes);
    colors[`color/${role}/on`] = pair(light.fg, dark.fg, modes);
  }
  colors["color/focus/ring"] = pair(brand[500], brand[400], modes);

  // Numbers: radius, spacing, type scale, stroke weights.
  const numbers: Record<string, number> = {
    "radius/sm": recipe.radius.sm,
    "radius/md": recipe.radius.md,
    "radius/lg": recipe.radius.lg,
    "radius/full": recipe.radius.full,
    "border/width": recipe.borderWidth,
    "border/focus": Math.max(FOCUS_RING_MIN, recipe.focusRing),
  };
  for (const [k, v] of Object.entries(spacingScale(recipe))) {
    numbers[`space/${k}`] = v;
  }
  for (const [k, v] of Object.entries(typeScale(recipe))) {
    numbers[`font/size/${k}`] = v;
  }

  const strings: Record<string, string> = {
    "font/family/sans": recipe.font.sans,
    "font/family/display": recipe.font.display,
    "font/family/mono": recipe.font.mono,
  };

  return { colors, numbers, strings };
}

export interface ContrastFinding {
  token: string;
  background: string;
  foreground: string;
  ratio: number;
  required: number;
  passes: boolean;
}

/**
 * Check every foreground/background pair a generated set claims is legible.
 *
 * This runs INSIDE generation, not only in the audit, because a palette that
 * fails here is not worth drawing sixty components with. `neumorphic` is
 * expected to produce findings — its whole premise is low contrast — which is
 * why the result is reported rather than thrown.
 */
export function checkContrast(
  tokens: TokenSet,
  mode: "light" | "dark" = "light",
): ContrastFinding[] {
  const val = (name: string): string | null => {
    const v = tokens.colors[name];
    if (v === undefined) return null;
    return typeof v === "string" ? v : v[mode];
  };
  const findings: ContrastFinding[] = [];

  const check = (
    token: string,
    bgName: string,
    fgName: string,
    required: number,
  ): void => {
    const bg = val(bgName);
    const fg = val(fgName);
    if (!bg || !fg) return;
    const ratio = Math.round(contrastRatio(bg, fg) * 100) / 100;
    findings.push({
      token,
      background: bg,
      foreground: fg,
      ratio,
      required,
      passes: ratio >= required,
    });
  };

  for (const role of ["primary", "success", "warning", "danger", "info"]) {
    check(`${role} button label`, `color/${role}/default`, `color/${role}/on`, 4.5);
  }
  check("body text", "color/bg/base", "color/text/primary", 4.5);
  check("secondary text", "color/bg/base", "color/text/secondary", 4.5);
  // 1.4.11 asks 3:1 for a boundary a user must FIND — the edge of an input,
  // the outline of a control. It does not ask it of a divider between two
  // cards, and demanding it there produces the grey-700 hairlines nobody
  // ships. So the strong border is checked and the default one is not.
  check("control border", "color/bg/base", "color/border/strong", 3);
  return findings;
}
