import { describe, expect, it } from "vitest";
import {
  STYLES,
  STYLE_IDS,
  buildTokens,
  checkContrast,
  typeScale,
  spacingScale,
  FOCUS_RING_MIN,
} from "../../src/shared/design-system/styles.js";
import {
  buildRamp,
  contrastRatio,
  readableOn,
  hslToHex,
  actionPair,
  RAMP_STEPS,
} from "../../src/shared/design-system/color.js";

/**
 * The generator's promise is that a system it produces is usable without
 * anybody checking it by hand. That promise is exactly one property —
 * measurable contrast — and it is swept across every style and a ring of
 * hues, because a palette generator that works on blue and fails on yellow
 * is the normal failure, not an exotic one.
 */

/** Every 30° of the wheel. Yellow (60) and cyan (180) are the hard ones. */
const HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

describe("colour ramp", () => {
  it("gets darker at every step, with no plateau", () => {
    const ramp = buildRamp(250, 70);
    for (let i = 1; i < RAMP_STEPS.length; i++) {
      const prev = contrastRatio(ramp[RAMP_STEPS[i - 1]!], "#ffffff");
      const cur = contrastRatio(ramp[RAMP_STEPS[i]!], "#ffffff");
      expect(cur, `step ${RAMP_STEPS[i]} is not darker than ${RAMP_STEPS[i - 1]}`).toBeGreaterThan(
        prev,
      );
    }
  });

  it("moves off the preferred step when that step cannot carry a label", () => {
    // The earlier version of this test asserted that step 600 always clears
    // 4.5:1 on white. It does not — orange 600 is 3.3:1 — and the assertion
    // was only ever green because the hue list started at blue. The real
    // invariant is not "600 is safe", it is "the pair that ships is safe",
    // so that is what is asserted now.
    for (const hue of HUES) {
      const ramp = buildRamp(hue, 70);
      const chosen = actionPair(ramp, [600, 700, 800, 900]);
      expect(chosen.ratio, `hue ${hue}`).toBeGreaterThanOrEqual(4.5);
    }
    // Orange keeps step 600 and flips the LABEL to black — 3.3:1 was white
    // on orange, and black on the same orange is comfortable. Fixing the
    // wrong end (darkening the ramp) is the tempting mistake here.
    const orange = actionPair(buildRamp(30, 70), [600, 700, 800, 900]);
    expect(orange.step).toBe(600);
    expect(orange.fg).toBe("#0a0a0a");
    // Violet has no black option that works, so it moves the surface instead.
    const violet = actionPair(buildRamp(280, 70), [600, 700, 800, 900]);
    expect(violet.fg).toBe("#ffffff");
  });

  it("picks the foreground by measuring, not by assuming light means dark text", () => {
    // A mid-yellow wants black; a mid-blue of the same lightness wants white.
    // A rule based on lightness alone gets one of these wrong.
    expect(readableOn(hslToHex(55, 95, 55))).toBe("#0a0a0a");
    expect(readableOn(hslToHex(240, 80, 45))).toBe("#ffffff");
  });
});

describe("every style", () => {
  it("covers ten distinct visual directions", () => {
    expect(STYLE_IDS).toHaveLength(10);
  });

  it("never ships a focus ring thinner than the minimum", () => {
    // Accessibility basics are not a style choice — see "When NOT to be lazy".
    for (const id of STYLE_IDS) {
      const t = buildTokens(STYLES[id]!);
      expect(t.numbers["border/focus"], id).toBeGreaterThanOrEqual(FOCUS_RING_MIN);
    }
  });

  it("differs in geometry, not only in colour", () => {
    // Ten hues with one radius is one system photographed ten times.
    const radii = new Set(STYLE_IDS.map((id) => STYLES[id]!.radius.md));
    const borders = new Set(STYLE_IDS.map((id) => STYLES[id]!.borderWidth));
    const fonts = new Set(STYLE_IDS.map((id) => STYLES[id]!.font.display));
    expect(radii.size).toBeGreaterThanOrEqual(6);
    expect(borders.size).toBeGreaterThanOrEqual(3);
    expect(fonts.size).toBeGreaterThanOrEqual(5);
  });

  it("keeps action labels legible at every hue, in both modes", () => {
    const failures: string[] = [];
    for (const id of STYLE_IDS) {
      for (const hue of HUES) {
        const tokens = buildTokens(STYLES[id]!, { hue, modes: true });
        for (const mode of ["light", "dark"] as const) {
          for (const f of checkContrast(tokens, mode)) {
            // No exemptions. The first version of this test excused
            // neumorphic's border finding, and the excuse was hiding the
            // real bug: the border token was a hardcoded ramp step for every
            // style, not just that one. Measuring the step fixed all ten, and
            // an exemption left in place would have kept the sweep quiet
            // about the next hardcoded value somebody adds.
            if (!f.passes) {
              failures.push(`${id}/${hue}/${mode}: ${f.token} = ${f.ratio}:1 (need ${f.required})`);
            }
          }
        }
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
  });
});

describe("scales", () => {
  it("makes a type scale that always goes up", () => {
    for (const id of STYLE_IDS) {
      const s = typeScale(STYLES[id]!);
      const order = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
      for (let i = 1; i < order.length; i++) {
        expect(s[order[i]!], `${id} ${order[i]}`).toBeGreaterThan(s[order[i - 1]!]!);
      }
    }
  });

  it("keeps spacing on even pixels whatever the density", () => {
    // Half-pixel padding is how an auto-layout row ends up 1px taller than
    // its neighbour for no reason anybody can see.
    for (const id of STYLE_IDS) {
      for (const v of Object.values(spacingScale(STYLES[id]!))) {
        expect(Number.isInteger(v), `${id}: ${v}`).toBe(true);
        expect(v % 2, `${id}: ${v} is odd`).toBe(0);
      }
    }
  });
});

describe("token set", () => {
  it("emits both modes when asked and one value when not", () => {
    const dual = buildTokens(STYLES.neutral!, { modes: true });
    const single = buildTokens(STYLES.neutral!, { modes: false });
    expect(typeof dual.colors["color/bg/base"]).toBe("object");
    expect(typeof single.colors["color/bg/base"]).toBe("string");
  });

  it("keeps danger red whatever the brand hue is", () => {
    // Rotating semantic hues off the brand made destructive buttons brown on
    // a green brand. Red means delete in every product the user has used.
    const green = buildTokens(STYLES.neutral!, { hue: 140, modes: false });
    const red = green.colors["color/danger/default"] as string;
    const { r, g, b } = {
      r: parseInt(red.slice(1, 3), 16),
      g: parseInt(red.slice(3, 5), 16),
      b: parseInt(red.slice(5, 7), 16),
    };
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });
});
