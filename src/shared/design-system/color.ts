/**
 * Palette maths for the generator.
 *
 * Deliberately not a colour library. It needs three things — build a ramp
 * from one hue, keep text readable on whatever it lands on, and do both
 * identically on the server and inside the plugin — and a dependency that
 * ships in both bundles for that is a bad trade.
 *
 * HSL, not OKLCH. OKLCH ramps are perceptually more even, but contrast is
 * computed from sRGB relative luminance in either space, and nothing here
 * trusts a step to be safe because of where it sits on a scale: every pair
 * that ships is measured (actionPair, lightestPassing, readableOn). The
 * ramp only has to be monotonic and pleasant, which HSL manages in a tenth
 * of the code.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** The eleven steps every colour ramp has, Tailwind-style. */
export const RAMP_STEPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;
export type RampStep = (typeof RAMP_STEPS)[number];

/**
 * Lightness (0–100) per step.
 *
 * These are a LOOK, not a guarantee. Orange 600 is 3.3:1 on white and that
 * is fine — actionPair moves to 700 for orange. Do not "fix" this table to
 * make one hue pass; it would make every other hue muddier.
 */
const LIGHTNESS: Record<RampStep, number> = {
  50: 97,
  100: 94,
  200: 87,
  300: 78,
  400: 66,
  500: 56,
  600: 47,
  700: 39,
  800: 31,
  900: 24,
  950: 15,
};

/**
 * Saturation multiplier per step.
 *
 * Flat saturation across a ramp is the single most recognisable "generated
 * palette" tell: the 50 comes out a lurid pastel and the 950 a muddy
 * near-black of the same intensity. Real ramps pull saturation in at both
 * ends and peak it in the middle.
 */
const SAT_CURVE: Record<RampStep, number> = {
  50: 0.42,
  100: 0.55,
  200: 0.7,
  300: 0.82,
  400: 0.93,
  500: 1,
  600: 1,
  700: 0.95,
  800: 0.88,
  900: 0.8,
  950: 0.7,
};

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** HSL (h 0–360, s/l 0–100) → hex. */
export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  const seg = Math.floor(hh / 60) % 6;
  const rgb: [number, number, number] =
    seg === 0
      ? [c, x, 0]
      : seg === 1
        ? [x, c, 0]
        : seg === 2
          ? [0, c, x]
          : seg === 3
            ? [0, x, c]
            : seg === 4
              ? [x, 0, c]
              : [c, 0, x];
  const to255 = (v: number): string =>
    Math.round(clamp((v + m) * 255, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${to255(rgb[0])}${to255(rgb[1])}${to255(rgb[2])}`;
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

/** WCAG relative luminance. */
export function luminance(c: Rgb): number {
  const ch = (v: number): number =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

/** WCAG contrast ratio between two hex colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The readable foreground for a background — black or white, whichever wins.
 *
 * Not "light backgrounds get dark text": that rule picks white on a mid-blue
 * that needs black, and the result fails AA by a hair in exactly the places
 * (primary buttons) a designer never re-checks. Measuring both costs two
 * luminance calls.
 */
export function readableOn(bg: string, dark = "#0a0a0a", light = "#ffffff"): string {
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
}

export interface Ramp {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

/**
 * Build an 11-step ramp from one hue.
 *
 * `chroma` is the base saturation at step 500; the curve above shapes the
 * rest. A neutral ramp is the same function with a low chroma and a hue
 * borrowed from the brand, which is what stops greys reading as dead next to
 * a warm primary.
 */
export function buildRamp(hue: number, chroma: number): Ramp {
  const out = {} as Ramp;
  for (const step of RAMP_STEPS) {
    out[step] = hslToHex(hue, chroma * SAT_CURVE[step], LIGHTNESS[step]);
  }
  return out;
}

/**
 * The lightest step of a ramp that still clears `min` against `bg`.
 *
 * Written after the contrast sweep caught the alternative: step 600 was
 * hardcoded for secondary text, and at a handful of hues it lands at 4.2:1 —
 * under AA, on every caption in the system, invisible in review because the
 * blue sample everybody looks at passes. Measuring costs eleven luminance
 * calls at generation time and removes the whole class.
 *
 * Lightest-that-passes, not darkest-available: secondary text has to stay
 * visibly quieter than primary or the hierarchy the token exists to express
 * is gone.
 */
export function lightestPassing(
  ramp: Ramp,
  bg: string,
  min: number,
  order: readonly RampStep[] = RAMP_STEPS,
): string {
  let best: string | null = null;
  for (const step of order) {
    const c = ramp[step];
    if (contrastRatio(c, bg) >= min) best = best ?? c;
  }
  // Nothing in the ramp clears it (a pale ramp on a pale background): fall
  // back to the darkest step rather than returning something that fails.
  return best ?? ramp[950];
}

/**
 * An action surface and the text on it, chosen together so the PAIR clears
 * `min` — not the surface first and the text afterwards.
 *
 * readableOn() alone is not enough and the sweep proved it: it returns the
 * better of black and white, which on a mid-violet 600 is 4.49:1. Better,
 * and still a fail. When neither foreground can carry the surface, the
 * surface is what has to move, so this walks `order` and takes the first
 * step whose best foreground actually passes.
 *
 * Yellow is the case that makes this non-optional: its 600 is bright enough
 * that white fails and dark enough that black is marginal, and it is the one
 * hue a reviewer never tries.
 */
export function actionPair(
  ramp: Ramp,
  order: readonly RampStep[],
  min = 4.5,
): { bg: string; fg: string; step: RampStep; ratio: number } {
  let fallback: { bg: string; fg: string; step: RampStep; ratio: number } | null = null;
  for (const step of order) {
    const bg = ramp[step];
    const fg = readableOn(bg);
    const ratio = contrastRatio(bg, fg);
    if (ratio >= min) return { bg, fg, step, ratio };
    if (!fallback || ratio > fallback.ratio) fallback = { bg, fg, step, ratio };
  }
  // Every candidate fails: hand back the best one rather than throwing, and
  // let checkContrast report it. A generator that refuses to draw is worse
  // than one that draws and tells you which token to nudge.
  return fallback!;
}

/** Hue offsets from the brand hue for the semantic roles. */
export interface SemanticHues {
  success: number;
  warning: number;
  danger: number;
  info: number;
}

/**
 * Semantic hues are ABSOLUTE, not rotated off the brand.
 *
 * Rotating them looked more "designed" for about an hour: with a green brand
 * the danger ramp came out orange-brown, and a destructive button that is not
 * red is a usability bug, not a style. Red means delete in every product the
 * user has ever used, and a palette generator does not get to renegotiate
 * that.
 */
export const SEMANTIC_HUES: SemanticHues = {
  success: 145,
  warning: 38,
  danger: 4,
  info: 210,
};
