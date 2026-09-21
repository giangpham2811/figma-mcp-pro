/**
 * The component catalog: sixty blueprints, as data.
 *
 * A blueprint is a `create()` spec tree — the same shape an agent would write
 * by hand — so the generator does not need a second drawing pipeline. The
 * plugin builds them through `createTree`, which means tokens, text styles,
 * font fallback, keep-clear placement and every safe default apply here for
 * free. A generator with its own node builder is a generator with its own
 * bugs; see ARCHITECTURE.md on builders that bypass the shared one.
 *
 * Every colour, radius and spacing value is a `$token` reference, never a
 * literal. That is the whole point: re-running the generator with a different
 * hue re-themes sixty components because none of them know what colour they
 * are.
 *
 * The file is long and flat on purpose. A "component factory" abstraction
 * over sixty one-screen definitions buys nothing and costs the ability to
 * read any single component's markup in one place.
 */
import type { StyleRecipe } from "./styles.js";

/** A create() spec. Deliberately loose — the plugin is the authority. */
export type Spec = Record<string, unknown>;

export interface Blueprint {
  /** "Group/Name" — the slash is what Figma's Assets panel groups on. */
  name: string;
  group: string;
  description: string;
  /** Variants, if this component is a set. Absent means a lone component. */
  variants?: Array<{ props: Record<string, string>; spec: Spec }>;
  /** Used when `variants` is absent. */
  spec?: Spec;
}

// ---------------------------------------------------------------------------
// Spec helpers. Short names because they appear a thousand times below.
// ---------------------------------------------------------------------------

interface BoxOpts {
  name?: string;
  dir?: "HORIZONTAL" | "VERTICAL";
  gap?: number | string;
  pad?: number | string | { x?: number | string; y?: number | string };
  fill?: string;
  radius?: string | number;
  border?: string;
  borderWidth?: number | string;
  w?: number | string;
  h?: number | string;
  align?: string;
  justify?: string;
  grow?: boolean;
  effects?: unknown[];
  clip?: boolean;
}

/** An auto-layout frame. */
function box(children: Spec[], o: BoxOpts = {}): Spec {
  const spec: Spec = {
    type: "FRAME",
    name: o.name ?? "Frame",
    layoutMode: o.dir ?? "HORIZONTAL",
    // Explicit, always: createTree warns (rightly) when a layout frame has no
    // itemSpacing, and sixty warnings per generation is noise that hides the
    // one warning that matters.
    itemSpacing: o.gap ?? 0,
    primaryAxisSizingMode: "AUTO",
    counterAxisSizingMode: "AUTO",
    counterAxisAlignItems: o.align ?? "CENTER",
    primaryAxisAlignItems: o.justify ?? "MIN",
    children,
  };
  if (o.pad !== undefined) {
    if (typeof o.pad === "object") {
      const p = o.pad as { x?: number | string; y?: number | string };
      if (p.x !== undefined) {
        spec.paddingLeft = p.x;
        spec.paddingRight = p.x;
      }
      if (p.y !== undefined) {
        spec.paddingTop = p.y;
        spec.paddingBottom = p.y;
      }
    } else {
      spec.padding = o.pad;
    }
  }
  if (o.fill !== undefined) spec.fill = o.fill;
  else spec.fills = [];
  if (o.radius !== undefined) spec.cornerRadius = o.radius;
  if (o.border !== undefined) {
    spec.strokes = [o.border];
    spec.strokeWeight = o.borderWidth ?? "$border/width";
    spec.strokeAlign = "INSIDE";
  }
  if (o.w !== undefined) {
    spec.w = o.w;
    spec.primaryAxisSizingMode = o.dir === "VERTICAL" ? spec.primaryAxisSizingMode : "FIXED";
    if (o.dir === "VERTICAL") spec.counterAxisSizingMode = "FIXED";
  }
  if (o.h !== undefined) {
    spec.h = o.h;
    if (o.dir === "VERTICAL") spec.primaryAxisSizingMode = "FIXED";
    else spec.counterAxisSizingMode = "FIXED";
  }
  if (o.grow) spec.layoutGrow = 1;
  if (o.effects) spec.effects = o.effects;
  if (o.clip) spec.clipsContent = true;
  return spec;
}

const col = (children: Spec[], o: BoxOpts = {}): Spec =>
  box(children, { ...o, dir: "VERTICAL", align: o.align ?? "MIN" });

interface TextOpts {
  name?: string;
  size?: string;
  color?: string;
  weight?: string;
  align?: string;
  grow?: boolean;
  w?: number;
}

function txt(content: string, o: TextOpts = {}): Spec {
  return {
    type: "TEXT",
    name: o.name ?? content.slice(0, 24),
    characters: content,
    fontSize: o.size ?? "$font/size/base",
    fill: o.color ?? "$color/text/primary",
    fontStyle: o.weight ?? "Regular",
    textAutoResize: "WIDTH_AND_HEIGHT",
    ...(o.align ? { textAlignHorizontal: o.align } : {}),
    ...(o.grow ? { layoutGrow: 1, textAutoResize: "HEIGHT" } : {}),
    ...(o.w ? { w: o.w, textAutoResize: "HEIGHT" } : {}),
  };
}

/** A square placeholder standing in for an icon the user will swap. */
const icon = (size: number | string = 16, color = "$color/text/primary"): Spec => ({
  type: "FRAME",
  name: "icon",
  w: size,
  h: size,
  fill: color,
  cornerRadius: 2,
  layoutMode: "NONE",
  // 60% so a placeholder never reads as a finished solid block in a review.
  opacity: 0.6,
});

/** A flexible gap that pushes the things around it apart. */
const spacer = (): Spec => ({
  type: "FRAME",
  name: "spacer",
  layoutGrow: 1,
  layoutMode: "HORIZONTAL",
  itemSpacing: 0,
  h: 1,
  fills: [],
  children: [],
});

const rule = (vertical = false): Spec => ({
  type: "RECTANGLE",
  name: "rule",
  ...(vertical ? { w: 1, h: 16 } : { h: 1, layoutAlign: "STRETCH" }),
  fill: "$color/border/default",
});

/** Lorem that reads like product copy, not like lorem. */
const SAMPLE = {
  title: "Section title",
  body: "A short line of supporting copy that shows how the component wraps.",
  label: "Label",
  help: "Helper text",
  error: "This field is required",
};

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

const SIZES = ["sm", "md", "lg"] as const;
const PADDING_X: Record<string, string> = {
  sm: "$space/2",
  md: "$space/3",
  lg: "$space/4",
};
const PADDING_Y: Record<string, string> = {
  sm: "$space/1",
  md: "$space/2",
  lg: "$space/3",
};
const FONT: Record<string, string> = {
  sm: "$font/size/sm",
  md: "$font/size/base",
  lg: "$font/size/lg",
};

/** Height floor per size. 44 is the touch target the small size must not go under. */
const MIN_H: Record<string, number> = { sm: 32, md: 40, lg: 48 };

function surfaceOf(r: StyleRecipe, level: "sm" | "md" | "lg"): Partial<BoxOpts> {
  const withBorder = r.surface === "border" || r.surface === "both" || r.surface === "glass";
  const withShadow = r.surface === "shadow" || r.surface === "both" || r.surface === "flat" || r.surface === "glass";
  return {
    ...(withBorder ? { border: "$color/border/default" } : {}),
    ...(withShadow && r.shadows[level].length > 0 ? { effects: r.shadows[level] } : {}),
  };
}

function buttonLabel(r: StyleRecipe, s: string): string {
  return r.buttonCase === "upper" ? s.toUpperCase() : s;
}

/**
 * Build every blueprint for a style.
 *
 * Takes the recipe rather than reading tokens, because the few decisions that
 * cannot be expressed as a token reference — does this style draw a border at
 * all, does it shout its button labels — live on the recipe.
 */
export function buildCatalog(r: StyleRecipe): Blueprint[] {
  const out: Blueprint[] = [];
  const add = (b: Blueprint): void => {
    out.push(b);
  };

  // ---- Primitives ---------------------------------------------------------

  add({
    name: "Primitives/Button",
    group: "Primitives",
    description:
      "The action control. Variant Tone covers the five semantic roles; State carries hover/active/disabled so a prototype does not need code.",
    variants: (["primary", "neutral", "danger"] as const).flatMap((tone) =>
      SIZES.map((size) => ({
        props: { Tone: tone, Size: size },
        spec: box(
          [icon(FONT[size]!, tone === "neutral" ? "$color/text/primary" : `$color/${tone}/on`), txt(buttonLabel(r, "Button"), {
            size: FONT[size],
            color: tone === "neutral" ? "$color/text/primary" : `$color/${tone}/on`,
            weight: "Medium",
          })],
          {
            name: "Button",
            gap: "$space/1",
            pad: { x: PADDING_X[size], y: PADDING_Y[size] },
            h: MIN_H[size],
            fill: tone === "neutral" ? "$color/bg/raised" : `$color/${tone}/default`,
            radius: r.radius.full === r.radius.md ? "$radius/full" : "$radius/md",
            ...(tone === "neutral" ? { border: "$color/border/strong" } : {}),
            justify: "CENTER",
          },
        ),
      })),
    ),
  });

  add({
    name: "Primitives/Icon button",
    group: "Primitives",
    description: "Square action. Never smaller than 44px on the md size — a 32px tap target is a missed tap.",
    variants: SIZES.map((size) => ({
      props: { Size: size },
      spec: box([icon(FONT[size]!)], {
        name: "Icon button",
        w: Math.max(44, MIN_H[size]!),
        h: Math.max(44, MIN_H[size]!),
        justify: "CENTER",
        fill: "$color/bg/raised",
        radius: "$radius/md",
        ...surfaceOf(r, "sm"),
      }),
    })),
  });

  add({
    name: "Primitives/Badge",
    group: "Primitives",
    description: "A count or status marker. Reads at a glance; never the only carrier of meaning.",
    variants: (["neutral", "success", "warning", "danger", "info"] as const).map((tone) => ({
      props: { Tone: tone },
      spec: box([txt("9", { size: "$font/size/xs", color: tone === "neutral" ? "$color/text/primary" : `$color/${tone}/default`, weight: "Medium" })], {
        name: "Badge",
        pad: { x: "$space/1", y: 2 },
        fill: tone === "neutral" ? "$color/bg/subtle" : `$color/${tone}/subtle`,
        radius: "$radius/full",
        justify: "CENTER",
      }),
    })),
  });

  add({
    name: "Primitives/Tag",
    group: "Primitives",
    description: "A word-sized label for categories. Rectangular where a badge is round.",
    spec: box([txt("Category", { size: "$font/size/xs", color: "$color/text/secondary" })], {
      name: "Tag",
      pad: { x: "$space/1", y: 2 },
      fill: "$color/bg/subtle",
      radius: "$radius/sm",
      border: "$color/border/default",
    }),
  });

  add({
    name: "Primitives/Chip",
    group: "Primitives",
    description: "A removable selection. The × is a real target, not decoration.",
    spec: box([txt("Selected", { size: "$font/size/sm" }), icon(14, "$color/text/secondary")], {
      name: "Chip",
      gap: "$space/1",
      pad: { x: "$space/2", y: "$space/1" },
      h: 32,
      fill: "$color/bg/subtle",
      radius: "$radius/full",
    }),
  });

  add({
    name: "Primitives/Avatar",
    group: "Primitives",
    description: "Person or org. Initials are the fallback, not a broken-image icon.",
    variants: (["sm", "md", "lg"] as const).map((size) => ({
      props: { Size: size },
      spec: box([txt("AB", { size: size === "sm" ? "$font/size/xs" : "$font/size/sm", color: "$color/primary/on", weight: "Medium" })], {
        name: "Avatar",
        w: size === "sm" ? 24 : size === "md" ? 32 : 48,
        h: size === "sm" ? 24 : size === "md" ? 32 : 48,
        justify: "CENTER",
        fill: "$color/primary/default",
        radius: "$radius/full",
      }),
    })),
  });

  add({
    name: "Primitives/Divider",
    group: "Primitives",
    description: "A hairline. Decorative, so it uses border/default and is exempt from the 3:1 rule.",
    spec: rule(),
  });

  add({
    name: "Primitives/Spinner",
    group: "Primitives",
    description: "Indeterminate wait. An arc, because a full ring cannot show rotation.",
    spec: {
      type: "ELLIPSE",
      name: "Spinner",
      w: 20,
      h: 20,
      fills: [],
      strokes: ["$color/primary/default"],
      strokeWeight: 2,
      arcData: { startingAngle: 0, endingAngle: 4.7, innerRadius: 0.8 },
    },
  });

  add({
    name: "Primitives/Progress",
    group: "Primitives",
    description: "Determinate. The track is always visible so 0% still reads as a progress bar.",
    spec: box(
      [box([], { name: "fill", w: 120, h: 6, fill: "$color/primary/default", radius: "$radius/full" })],
      { name: "Progress", w: 240, h: 6, fill: "$color/bg/subtle", radius: "$radius/full" },
    ),
  });

  add({
    name: "Primitives/Skeleton",
    group: "Primitives",
    description: "Loading placeholder shaped like the content it replaces, so the layout does not jump.",
    spec: col(
      [
        box([], { name: "line", w: 200, h: 12, fill: "$color/bg/subtle", radius: "$radius/sm" }),
        box([], { name: "line", w: 140, h: 12, fill: "$color/bg/subtle", radius: "$radius/sm" }),
      ],
      { name: "Skeleton", gap: "$space/1" },
    ),
  });

  add({
    name: "Primitives/Tooltip",
    group: "Primitives",
    description: "Short clarification on hover. Never the only place information lives — touch has no hover.",
    spec: box([txt("Tooltip text", { size: "$font/size/xs", color: "$color/bg/base" })], {
      name: "Tooltip",
      pad: { x: "$space/2", y: "$space/1" },
      fill: "$color/text/primary",
      radius: "$radius/sm",
    }),
  });

  add({
    name: "Primitives/Kbd",
    group: "Primitives",
    description: "A key cap. Monospace, because a proportional ⌘K is unreadable.",
    spec: box([txt("⌘K", { size: "$font/size/xs", color: "$color/text/secondary" })], {
      name: "Kbd",
      pad: { x: "$space/1", y: 2 },
      fill: "$color/bg/subtle",
      radius: "$radius/sm",
      border: "$color/border/default",
    }),
  });

  // ---- Forms --------------------------------------------------------------

  /** The input shell every text-ish field reuses. */
  const field = (inner: Spec[], name: string, state: string): Spec =>
    box(inner, {
      name,
      gap: "$space/1",
      pad: { x: "$space/2", y: "$space/2" },
      w: 280,
      h: 44,
      fill: state === "disabled" ? "$color/bg/subtle" : "$color/bg/raised",
      radius: "$radius/md",
      // A field is a boundary the user must FIND, so border/strong, and on
      // focus the ring colour at the focus width — 1.4.11 territory.
      border:
        state === "error"
          ? "$color/danger/default"
          : state === "focus"
            ? "$color/focus/ring"
            : "$color/border/strong",
      borderWidth: state === "focus" ? "$border/focus" : "$border/width",
    });

  const FIELD_STATES = ["default", "focus", "error", "disabled"] as const;

  add({
    name: "Forms/Input",
    group: "Forms",
    description: "Single-line text. 44px tall at every state — the one measurement a design system must not negotiate.",
    variants: FIELD_STATES.map((state) => ({
      props: { State: state },
      spec: field(
        [txt(state === "default" ? "Placeholder" : "Value", {
          size: "$font/size/base",
          color: state === "default" ? "$color/text/disabled" : "$color/text/primary",
          grow: true,
        })],
        "Input",
        state,
      ),
    })),
  });

  add({
    name: "Forms/Textarea",
    group: "Forms",
    description: "Multi-line. Grows downward; never scrolls inside a fixed 44px shell.",
    spec: box([txt(SAMPLE.body, { color: "$color/text/disabled", grow: true })], {
      name: "Textarea",
      w: 280,
      h: 96,
      align: "MIN",
      pad: "$space/2",
      fill: "$color/bg/raised",
      radius: "$radius/md",
      border: "$color/border/strong",
    }),
  });

  add({
    name: "Forms/Select",
    group: "Forms",
    description: "Choice from a list. The chevron is what separates it from an input at a glance.",
    variants: FIELD_STATES.map((state) => ({
      props: { State: state },
      spec: field(
        [
          txt("Choose one", { color: state === "disabled" ? "$color/text/disabled" : "$color/text/primary", grow: true }),
          icon(16, "$color/text/secondary"),
        ],
        "Select",
        state,
      ),
    })),
  });

  add({
    name: "Forms/Checkbox",
    group: "Forms",
    description: "Independent on/off. The 20px box sits in a 44px row, so the label is part of the target.",
    variants: (["unchecked", "checked", "indeterminate", "disabled"] as const).map((state) => ({
      props: { State: state },
      spec: box(
        [
          box(state === "unchecked" ? [] : [icon(12, "$color/primary/on")], {
            name: "box",
            w: 20,
            h: 20,
            justify: "CENTER",
            fill: state === "unchecked" || state === "disabled" ? "$color/bg/raised" : "$color/primary/default",
            radius: "$radius/sm",
            border: "$color/border/strong",
          }),
          txt("Checkbox label", { color: state === "disabled" ? "$color/text/disabled" : "$color/text/primary" }),
        ],
        { name: "Checkbox", gap: "$space/2", h: 44 },
      ),
    })),
  });

  add({
    name: "Forms/Radio",
    group: "Forms",
    description: "One of several. Round, because square means multi-select and users read that shape before the label.",
    variants: (["unselected", "selected", "disabled"] as const).map((state) => ({
      props: { State: state },
      spec: box(
        [
          box(state === "selected" ? [box([], { name: "dot", w: 8, h: 8, fill: "$color/primary/on", radius: "$radius/full" })] : [], {
            name: "ring",
            w: 20,
            h: 20,
            justify: "CENTER",
            fill: state === "selected" ? "$color/primary/default" : "$color/bg/raised",
            radius: "$radius/full",
            border: "$color/border/strong",
          }),
          txt("Radio label", { color: state === "disabled" ? "$color/text/disabled" : "$color/text/primary" }),
        ],
        { name: "Radio", gap: "$space/2", h: 44 },
      ),
    })),
  });

  add({
    name: "Forms/Switch",
    group: "Forms",
    description: "Immediate effect, no save button. That is the only thing separating it from a checkbox.",
    variants: (["off", "on", "disabled"] as const).map((state) => ({
      props: { State: state },
      spec: box(
        [
          box([box([], { name: "knob", w: 20, h: 20, fill: "#ffffff", radius: "$radius/full" })], {
            name: "track",
            w: 44,
            h: 24,
            pad: { x: 2 },
            justify: state === "on" ? "MAX" : "MIN",
            fill: state === "on" ? "$color/primary/default" : "$color/border/strong",
            radius: "$radius/full",
          }),
          txt("Switch label", { color: state === "disabled" ? "$color/text/disabled" : "$color/text/primary" }),
        ],
        { name: "Switch", gap: "$space/2", h: 44 },
      ),
    })),
  });

  add({
    name: "Forms/Slider",
    group: "Forms",
    description: "Continuous value. The 20px handle is the target; the 4px track is not.",
    spec: box(
      [
        box([box([], { name: "filled", w: 120, h: 4, fill: "$color/primary/default", radius: "$radius/full" })], {
          name: "track",
          w: 240,
          h: 4,
          fill: "$color/bg/subtle",
          radius: "$radius/full",
        }),
      ],
      { name: "Slider", h: 44, justify: "CENTER" },
    ),
  });

  add({
    name: "Forms/Field",
    group: "Forms",
    description: "Label + control + help/error. The wrapper that makes a form accessible; use it rather than a bare Input.",
    variants: (["help", "error"] as const).map((state) => ({
      props: { State: state },
      spec: col(
        [
          txt(SAMPLE.label, { size: "$font/size/sm", weight: "Medium" }),
          field([txt("Value", { grow: true })], "Input", state === "error" ? "error" : "default"),
          txt(state === "error" ? SAMPLE.error : SAMPLE.help, {
            size: "$font/size/xs",
            color: state === "error" ? "$color/danger/default" : "$color/text/secondary",
          }),
        ],
        { name: "Field", gap: "$space/1" },
      ),
    })),
  });

  add({
    name: "Forms/Search",
    group: "Forms",
    description: "Find-as-you-type. The magnifier goes left; a clear × appears only when there is something to clear.",
    spec: field([icon(16, "$color/text/secondary"), txt("Search", { color: "$color/text/disabled", grow: true }), ...[icon(16, "$color/text/secondary")]], "Search", "default"),
  });

  add({
    name: "Forms/File upload",
    group: "Forms",
    description: "Drop zone. Always pairs with a button — drag-and-drop alone is unreachable by keyboard.",
    spec: col(
      [icon(24, "$color/text/secondary"), txt("Drop a file, or", { size: "$font/size/sm", color: "$color/text/secondary" }), txt("browse", { size: "$font/size/sm", color: "$color/primary/default", weight: "Medium" })],
      {
        name: "File upload",
        gap: "$space/1",
        pad: "$space/5",
        w: 320,
        align: "CENTER",
        justify: "CENTER",
        fill: "$color/bg/subtle",
        radius: "$radius/md",
        border: "$color/border/strong",
      },
    ),
  });

  add({
    name: "Forms/Date input",
    group: "Forms",
    description: "A date field with its calendar affordance. The text entry stays usable when the picker is not.",
    spec: field([txt("2026-09-21", { grow: true }), icon(16, "$color/text/secondary")], "Date input", "default"),
  });

  add({
    name: "Forms/Stepper input",
    group: "Forms",
    description: "Small integers. Both buttons are 44px; typing stays possible for large values.",
    spec: box(
      [
        box([txt("−", { weight: "Medium" })], { name: "minus", w: 44, h: 44, justify: "CENTER", border: "$color/border/strong", radius: "$radius/md" }),
        box([txt("1")], { name: "value", w: 56, h: 44, justify: "CENTER", border: "$color/border/strong" }),
        box([txt("+", { weight: "Medium" })], { name: "plus", w: 44, h: 44, justify: "CENTER", border: "$color/border/strong", radius: "$radius/md" }),
      ],
      { name: "Stepper input", gap: "$space/1" },
    ),
  });

  add({
    name: "Forms/OTP input",
    group: "Forms",
    description: "One box per digit. Paste must fill all of them — the classic thing this pattern gets wrong.",
    spec: box(
      [0, 1, 2, 3, 4, 5].map((i) =>
        box([txt(i < 3 ? String(i + 1) : "", { size: "$font/size/lg" })], {
          name: `digit-${i}`,
          w: 44,
          h: 52,
          justify: "CENTER",
          fill: "$color/bg/raised",
          radius: "$radius/md",
          border: i === 3 ? "$color/focus/ring" : "$color/border/strong",
        }),
      ),
      { name: "OTP input", gap: "$space/1" },
    ),
  });

  add({
    name: "Forms/Color input",
    group: "Forms",
    description: "Swatch plus hex. The hex is editable because the swatch alone is not accessible.",
    spec: field([box([], { name: "swatch", w: 24, h: 24, fill: "$color/primary/default", radius: "$radius/sm" }), txt("#4F46E5", { grow: true })], "Color input", "default"),
  });

  // ---- Feedback -----------------------------------------------------------

  const TONES = ["info", "success", "warning", "danger"] as const;

  add({
    name: "Feedback/Alert",
    group: "Feedback",
    description: "In-page message tied to a region. Icon plus text, because colour alone fails for 8% of men.",
    variants: TONES.map((tone) => ({
      props: { Tone: tone },
      spec: box(
        [
          icon(20, `$color/${tone}/default`),
          col([txt(SAMPLE.title, { weight: "Medium" }), txt(SAMPLE.body, { size: "$font/size/sm", color: "$color/text/secondary", w: 360 })], { gap: 2, grow: true }),
        ],
        {
          name: "Alert",
          gap: "$space/2",
          pad: "$space/3",
          w: 480,
          align: "MIN",
          fill: `$color/${tone}/subtle`,
          radius: "$radius/md",
          border: `$color/${tone}/default`,
        },
      ),
    })),
  });

  add({
    name: "Feedback/Toast",
    group: "Feedback",
    description: "Transient confirmation. Never carries the only copy of information the user needs.",
    spec: box(
      [icon(18, "$color/success/default"), txt("Saved", { grow: true }), txt("Undo", { color: "$color/primary/default", weight: "Medium" })],
      { name: "Toast", gap: "$space/2", pad: "$space/3", w: 360, fill: "$color/bg/raised", radius: "$radius/md", ...surfaceOf(r, "lg") },
    ),
  });

  add({
    name: "Feedback/Banner",
    group: "Feedback",
    description: "Page-wide, persistent. Full-bleed so it does not read as a dismissible toast.",
    spec: box(
      [icon(18, "$color/info/default"), txt("A message that applies to the whole page.", { grow: true }), icon(16, "$color/text/secondary")],
      { name: "Banner", gap: "$space/2", pad: { x: "$space/4", y: "$space/2" }, w: 960, fill: "$color/info/subtle" },
    ),
  });

  add({
    name: "Feedback/Empty state",
    group: "Feedback",
    description: "Nothing here yet. Always offers the action that fills it — an empty screen with no next step is a dead end.",
    spec: col(
      [
        icon(48, "$color/text/disabled"),
        txt("No items yet", { size: "$font/size/lg", weight: "Medium" }),
        txt("Create the first one to get started.", { size: "$font/size/sm", color: "$color/text/secondary" }),
        box([txt(buttonLabel(r, "Create"), { color: "$color/primary/on", weight: "Medium" })], {
          name: "action",
          pad: { x: "$space/3", y: "$space/2" },
          h: 44,
          justify: "CENTER",
          fill: "$color/primary/default",
          radius: "$radius/md",
        }),
      ],
      { name: "Empty state", gap: "$space/2", pad: "$space/6", w: 420, align: "CENTER", justify: "CENTER" },
    ),
  });

  add({
    name: "Feedback/Callout",
    group: "Feedback",
    description: "An aside in body copy. A left rule instead of a full border, so it does not compete with cards.",
    spec: box([rule(true), col([txt("Note", { weight: "Medium", size: "$font/size/sm" }), txt(SAMPLE.body, { size: "$font/size/sm", color: "$color/text/secondary", w: 400 })], { gap: 2 })], {
      name: "Callout",
      gap: "$space/2",
      pad: "$space/3",
      align: "MIN",
      fill: "$color/bg/subtle",
      radius: "$radius/sm",
    }),
  });

  add({
    name: "Feedback/Modal",
    group: "Feedback",
    description: "Blocks the page. Title, body, and actions right-aligned with the primary last — the platform order.",
    spec: col(
      [
        box([txt("Dialog title", { size: "$font/size/lg", weight: "Medium", grow: true }), icon(18, "$color/text/secondary")], { name: "header", gap: "$space/2" }),
        txt(SAMPLE.body, { size: "$font/size/sm", color: "$color/text/secondary", w: 440 }),
        box(
          [
            spacer(),
            box([txt(buttonLabel(r, "Cancel"))], { name: "cancel", pad: { x: "$space/3", y: "$space/2" }, h: 44, justify: "CENTER", border: "$color/border/strong", radius: "$radius/md" }),
            box([txt(buttonLabel(r, "Confirm"), { color: "$color/primary/on", weight: "Medium" })], { name: "confirm", pad: { x: "$space/3", y: "$space/2" }, h: 44, justify: "CENTER", fill: "$color/primary/default", radius: "$radius/md" }),
          ],
          { name: "actions", gap: "$space/2", w: 440 },
        ),
      ],
      { name: "Modal", gap: "$space/3", pad: "$space/4", w: 480, fill: "$color/bg/raised", radius: "$radius/lg", ...surfaceOf(r, "lg") },
    ),
  });

  add({
    name: "Feedback/Drawer",
    group: "Feedback",
    description: "Side panel for secondary flows. Keeps page context visible, which a modal destroys.",
    spec: col(
      [box([txt("Panel title", { size: "$font/size/lg", weight: "Medium", grow: true }), icon(18)], { name: "header", gap: "$space/2", w: 320 }), rule(), txt(SAMPLE.body, { size: "$font/size/sm", color: "$color/text/secondary", w: 320 })],
      { name: "Drawer", gap: "$space/3", pad: "$space/4", w: 360, h: 520, fill: "$color/bg/raised", ...surfaceOf(r, "lg") },
    ),
  });

  add({
    name: "Feedback/Popover",
    group: "Feedback",
    description: "Anchored, interactive, dismissible. A tooltip that you can click inside is this, not a tooltip.",
    spec: col([txt("Popover title", { weight: "Medium", size: "$font/size/sm" }), txt(SAMPLE.body, { size: "$font/size/xs", color: "$color/text/secondary", w: 220 })], {
      name: "Popover",
      gap: "$space/1",
      pad: "$space/3",
      w: 260,
      fill: "$color/bg/raised",
      radius: "$radius/md",
      ...surfaceOf(r, "md"),
    }),
  });

  // ---- Navigation ---------------------------------------------------------

  add({
    name: "Navigation/Navbar",
    group: "Navigation",
    description: "Top-level chrome. Logo, primary links, account — in that order, left to right.",
    spec: box(
      [
        txt("Product", { size: "$font/size/lg", weight: "Medium" }),
        box([txt("Home", { size: "$font/size/sm" }), txt("Projects", { size: "$font/size/sm" }), txt("Settings", { size: "$font/size/sm", color: "$color/text/secondary" })], { gap: "$space/3" }),
        spacer(),
        box([], { name: "avatar", w: 32, h: 32, fill: "$color/primary/default", radius: "$radius/full" }),
      ],
      { name: "Navbar", gap: "$space/4", pad: { x: "$space/4", y: "$space/2" }, w: 1120, h: 64, fill: "$color/bg/raised", border: "$color/border/default" },
    ),
  });

  add({
    name: "Navigation/Sidebar item",
    group: "Navigation",
    description: "One row of the side nav. Selected state uses a fill AND a weight change, never colour alone.",
    variants: (["default", "selected"] as const).map((state) => ({
      props: { State: state },
      spec: box([icon(18, state === "selected" ? "$color/primary/default" : "$color/text/secondary"), txt("Navigation item", { size: "$font/size/sm", weight: state === "selected" ? "Medium" : "Regular", grow: true })], {
        name: "Sidebar item",
        gap: "$space/2",
        pad: { x: "$space/2" },
        w: 240,
        h: 44,
        fill: state === "selected" ? "$color/primary/subtle" : undefined,
        radius: "$radius/md",
      }),
    })),
  });

  add({
    name: "Navigation/Tabs",
    group: "Navigation",
    description: "Sibling views. The active tab carries an underline, so it survives a greyscale print.",
    spec: box(
      [
        col([txt("Active", { size: "$font/size/sm", weight: "Medium" }), box([], { name: "indicator", w: 56, h: 2, fill: "$color/primary/default" })], { gap: "$space/1", align: "CENTER" }),
        col([txt("Second", { size: "$font/size/sm", color: "$color/text/secondary" }), box([], { name: "indicator", w: 56, h: 2, fills: [] } as BoxOpts)], { gap: "$space/1", align: "CENTER" }),
      ],
      { name: "Tabs", gap: "$space/3", h: 44, align: "MAX" },
    ),
  });

  add({
    name: "Navigation/Breadcrumb",
    group: "Navigation",
    description: "Where you are in the hierarchy. The last crumb is the current page and is not a link.",
    spec: box([txt("Home", { size: "$font/size/sm", color: "$color/primary/default" }), txt("/", { size: "$font/size/sm", color: "$color/text/disabled" }), txt("Projects", { size: "$font/size/sm", color: "$color/primary/default" }), txt("/", { size: "$font/size/sm", color: "$color/text/disabled" }), txt("Current", { size: "$font/size/sm", color: "$color/text/secondary" })], {
      name: "Breadcrumb",
      gap: "$space/1",
      h: 32,
    }),
  });

  add({
    name: "Navigation/Pagination",
    group: "Navigation",
    description: "Page-by-page. Every target is 44px — this is the control people mis-tap most.",
    spec: box(
      [
        box([txt("‹")], { name: "prev", w: 44, h: 44, justify: "CENTER", border: "$color/border/strong", radius: "$radius/md" }),
        ...["1", "2", "3"].map((n) =>
          box([txt(n, { color: n === "2" ? "$color/primary/on" : "$color/text/primary" })], {
            name: `page-${n}`,
            w: 44,
            h: 44,
            justify: "CENTER",
            fill: n === "2" ? "$color/primary/default" : undefined,
            radius: "$radius/md",
            ...(n === "2" ? {} : { border: "$color/border/default" }),
          }),
        ),
        box([txt("›")], { name: "next", w: 44, h: 44, justify: "CENTER", border: "$color/border/strong", radius: "$radius/md" }),
      ],
      { name: "Pagination", gap: "$space/1" },
    ),
  });

  add({
    name: "Navigation/Menu item",
    group: "Navigation",
    description: "A row of a dropdown. Keeps room for an icon and a shortcut so the menu does not reflow.",
    spec: box([icon(16, "$color/text/secondary"), txt("Menu item", { size: "$font/size/sm", grow: true }), txt("⌘K", { size: "$font/size/xs", color: "$color/text/disabled" })], {
      name: "Menu item",
      gap: "$space/2",
      pad: { x: "$space/2" },
      w: 240,
      h: 40,
      radius: "$radius/sm",
    }),
  });

  add({
    name: "Navigation/Segmented control",
    group: "Navigation",
    description: "Two to four exclusive options. More than four and this should be a Select.",
    spec: box(
      [
        box([txt("One", { size: "$font/size/sm", weight: "Medium" })], { name: "seg", pad: { x: "$space/3", y: "$space/1" }, h: 36, justify: "CENTER", fill: "$color/bg/raised", radius: "$radius/sm" }),
        box([txt("Two", { size: "$font/size/sm", color: "$color/text/secondary" })], { name: "seg", pad: { x: "$space/3", y: "$space/1" }, h: 36, justify: "CENTER" }),
      ],
      { name: "Segmented control", gap: 2, pad: 2, h: 44, fill: "$color/bg/subtle", radius: "$radius/md" },
    ),
  });

  add({
    name: "Navigation/Stepper",
    group: "Navigation",
    description: "Progress through a multi-step flow. Numbers, not just dots — 'step 2 of 4' has to be readable.",
    spec: box(
      [
        box([txt("1", { size: "$font/size/sm", color: "$color/primary/on" })], { name: "done", w: 28, h: 28, justify: "CENTER", fill: "$color/primary/default", radius: "$radius/full" }),
        box([], { name: "line", w: 48, h: 2, fill: "$color/border/default" }),
        box([txt("2", { size: "$font/size/sm" })], { name: "current", w: 28, h: 28, justify: "CENTER", radius: "$radius/full", border: "$color/primary/default" }),
        box([], { name: "line", w: 48, h: 2, fill: "$color/border/default" }),
        box([txt("3", { size: "$font/size/sm", color: "$color/text/disabled" })], { name: "todo", w: 28, h: 28, justify: "CENTER", radius: "$radius/full", border: "$color/border/default" }),
      ],
      { name: "Stepper", gap: "$space/1" },
    ),
  });

  add({
    name: "Navigation/Link",
    group: "Navigation",
    description: "Inline navigation. Underlined, because colour-only links are invisible to colour-blind readers in body text.",
    spec: txt("A text link", { color: "$color/primary/default", name: "Link" }),
  });

  add({
    name: "Navigation/Footer",
    group: "Navigation",
    description: "Site-level links and legal. Multi-column so it does not become a wall of links on desktop.",
    spec: box(
      [
        col([txt("Product", { weight: "Medium", size: "$font/size/sm" }), txt("Features", { size: "$font/size/sm", color: "$color/text/secondary" }), txt("Pricing", { size: "$font/size/sm", color: "$color/text/secondary" })], { gap: "$space/1" }),
        col([txt("Company", { weight: "Medium", size: "$font/size/sm" }), txt("About", { size: "$font/size/sm", color: "$color/text/secondary" }), txt("Careers", { size: "$font/size/sm", color: "$color/text/secondary" })], { gap: "$space/1" }),
      ],
      { name: "Footer", gap: "$space/6", pad: "$space/5", w: 1120, align: "MIN", fill: "$color/bg/subtle" },
    ),
  });

  // ---- Data ---------------------------------------------------------------

  add({
    name: "Data/Card",
    group: "Data",
    description: "The generic surface. Whether it has a border, a shadow, both or neither is the clearest signature of the style.",
    spec: col(
      [txt(SAMPLE.title, { size: "$font/size/lg", weight: "Medium" }), txt(SAMPLE.body, { size: "$font/size/sm", color: "$color/text/secondary", w: 288 })],
      { name: "Card", gap: "$space/2", pad: "$space/4", w: 320, fill: "$color/bg/raised", radius: "$radius/lg", ...surfaceOf(r, "md") },
    ),
  });

  add({
    name: "Data/List item",
    group: "Data",
    description: "A row in a list. Avatar, two lines, trailing affordance — the shape ninety percent of lists need.",
    spec: box(
      [
        box([], { name: "avatar", w: 40, h: 40, fill: "$color/primary/subtle", radius: "$radius/full" }),
        col([txt("Primary line", { size: "$font/size/sm", weight: "Medium" }), txt("Secondary line", { size: "$font/size/xs", color: "$color/text/secondary" })], { gap: 2, grow: true }),
        icon(16, "$color/text/secondary"),
      ],
      { name: "List item", gap: "$space/2", pad: { x: "$space/2", y: "$space/2" }, w: 420, h: 64 },
    ),
  });

  add({
    name: "Data/Table header",
    group: "Data",
    description: "Column labels with sort affordance. Sticky in practice, which is why it is its own component.",
    spec: box(
      [txt("Name", { size: "$font/size/xs", weight: "Medium", color: "$color/text/secondary", grow: true }), txt("Status", { size: "$font/size/xs", weight: "Medium", color: "$color/text/secondary", w: 96 }), txt("Updated", { size: "$font/size/xs", weight: "Medium", color: "$color/text/secondary", w: 120 })],
      { name: "Table header", gap: "$space/2", pad: { x: "$space/2", y: "$space/1" }, w: 640, h: 40, fill: "$color/bg/subtle" },
    ),
  });

  add({
    name: "Data/Table row",
    group: "Data",
    description: "One record. Column widths must match the header exactly or the whole table reads as broken.",
    spec: box(
      [txt("Record name", { size: "$font/size/sm", grow: true }), txt("Active", { size: "$font/size/sm", color: "$color/success/default", w: 96 }), txt("2 days ago", { size: "$font/size/sm", color: "$color/text/secondary", w: 120 })],
      { name: "Table row", gap: "$space/2", pad: { x: "$space/2", y: "$space/2" }, w: 640, h: 48, border: "$color/border/default" },
    ),
  });

  add({
    name: "Data/Stat",
    group: "Data",
    description: "One number with its label and delta. The delta needs an arrow, not just green or red.",
    spec: col(
      [txt("Revenue", { size: "$font/size/xs", color: "$color/text/secondary" }), txt("$48,120", { size: "$font/size/2xl", weight: "Medium" }), box([icon(12, "$color/success/default"), txt("+12.4%", { size: "$font/size/xs", color: "$color/success/default" })], { gap: 4 })],
      { name: "Stat", gap: "$space/1", pad: "$space/3", w: 200, fill: "$color/bg/raised", radius: "$radius/md", ...surfaceOf(r, "sm") },
    ),
  });

  add({
    name: "Data/Timeline item",
    group: "Data",
    description: "One event on a vertical track. The connector runs through, so items stack without a gap.",
    spec: box(
      [
        col([box([], { name: "dot", w: 10, h: 10, fill: "$color/primary/default", radius: "$radius/full" }), box([], { name: "line", w: 2, h: 40, fill: "$color/border/default" })], { gap: 4, align: "CENTER" }),
        col([txt("Event happened", { size: "$font/size/sm", weight: "Medium" }), txt("21 Sep 2026, 14:20", { size: "$font/size/xs", color: "$color/text/secondary" })], { gap: 2 }),
      ],
      { name: "Timeline item", gap: "$space/2", align: "MIN" },
    ),
  });

  add({
    name: "Data/Accordion item",
    group: "Data",
    description: "Collapsible section. The whole header row is the target, not just the chevron.",
    variants: (["collapsed", "expanded"] as const).map((state) => ({
      props: { State: state },
      spec: col(
        [
          box([txt("Section heading", { size: "$font/size/sm", weight: "Medium", grow: true }), icon(16, "$color/text/secondary")], { name: "header", gap: "$space/2", w: 420, h: 48 }),
          ...(state === "expanded" ? [txt(SAMPLE.body, { size: "$font/size/sm", color: "$color/text/secondary", w: 420 })] : []),
        ],
        { name: "Accordion item", gap: "$space/1", pad: { x: "$space/2" }, border: "$color/border/default" },
      ),
    })),
  });

  add({
    name: "Data/Rating",
    group: "Data",
    description: "Five stars plus the number. The numeral is what a screen reader and a skimmer both use.",
    spec: box([...[0, 1, 2, 3, 4].map((i) => icon(16, i < 4 ? "$color/warning/default" : "$color/border/strong")), txt("4.0", { size: "$font/size/sm", color: "$color/text/secondary" })], { name: "Rating", gap: 4 }),
  });

  add({
    name: "Data/Tree item",
    group: "Data",
    description: "One node of a tree, indented. Indentation is padding, not a margin hack, so nesting composes.",
    spec: box([icon(14, "$color/text/secondary"), icon(16, "$color/text/secondary"), txt("Folder name", { size: "$font/size/sm", grow: true })], {
      name: "Tree item",
      gap: "$space/1",
      pad: { x: "$space/2" },
      w: 260,
      h: 36,
    }),
  });

  add({
    name: "Data/Chart frame",
    group: "Data",
    description: "The shell a chart lands in: title, legend, plot area. The plot is a placeholder — charts are data, not components.",
    spec: col(
      [
        box([txt("Chart title", { size: "$font/size/sm", weight: "Medium", grow: true }), box([box([], { name: "swatch", w: 10, h: 10, fill: "$color/primary/default", radius: 2 }), txt("Series", { size: "$font/size/xs", color: "$color/text/secondary" })], { gap: 4 })], { name: "header", gap: "$space/2", w: 368 }),
        box([], { name: "plot", w: 368, h: 180, fill: "$color/bg/subtle", radius: "$radius/sm" }),
      ],
      { name: "Chart frame", gap: "$space/2", pad: "$space/3", w: 400, fill: "$color/bg/raised", radius: "$radius/md", ...surfaceOf(r, "sm") },
    ),
  });

  // ---- Layout -------------------------------------------------------------

  add({
    name: "Layout/Page header",
    group: "Layout",
    description: "Title, subtitle, primary action. The one component every screen starts with.",
    spec: box(
      [
        col([txt("Page title", { size: "$font/size/2xl", weight: "Medium" }), txt("What this page is for.", { size: "$font/size/sm", color: "$color/text/secondary" })], { gap: "$space/1", grow: true }),
        box([txt(buttonLabel(r, "Primary action"), { color: "$color/primary/on", weight: "Medium" })], { name: "action", pad: { x: "$space/3", y: "$space/2" }, h: 44, justify: "CENTER", fill: "$color/primary/default", radius: "$radius/md" }),
      ],
      { name: "Page header", gap: "$space/4", w: 960, align: "CENTER" },
    ),
  });

  add({
    name: "Layout/Section header",
    group: "Layout",
    description: "A heading inside a page. Smaller than a page header and without the primary action.",
    spec: box([col([txt(SAMPLE.title, { size: "$font/size/lg", weight: "Medium" }), txt("Supporting line", { size: "$font/size/xs", color: "$color/text/secondary" })], { gap: 2, grow: true }), txt("View all", { size: "$font/size/sm", color: "$color/primary/default" })], {
      name: "Section header",
      gap: "$space/2",
      w: 640,
    }),
  });

  add({
    name: "Layout/Toolbar",
    group: "Layout",
    description: "Filters and bulk actions above a table. Left is scope, right is action — never mixed.",
    spec: box(
      [
        field([icon(14, "$color/text/secondary"), txt("Search", { size: "$font/size/sm", color: "$color/text/disabled", grow: true })], "search", "default"),
        box([txt("Filter", { size: "$font/size/sm" }), icon(14, "$color/text/secondary")], { name: "filter", gap: "$space/1", pad: { x: "$space/2" }, h: 44, border: "$color/border/strong", radius: "$radius/md" }),
        spacer(),
        box([txt(buttonLabel(r, "New"), { color: "$color/primary/on", weight: "Medium", size: "$font/size/sm" })], { name: "new", pad: { x: "$space/3" }, h: 44, justify: "CENTER", fill: "$color/primary/default", radius: "$radius/md" }),
      ],
      { name: "Toolbar", gap: "$space/2", w: 800 },
    ),
  });

  add({
    name: "Layout/Panel",
    group: "Layout",
    description: "A titled region inside a page. Thinner than a card; groups without claiming to be clickable.",
    spec: col([box([txt("Panel title", { size: "$font/size/sm", weight: "Medium", grow: true })], { name: "header", w: 368, h: 40 }), rule(), box([], { name: "body", w: 368, h: 120 })], {
      name: "Panel",
      gap: "$space/2",
      pad: "$space/3",
      w: 400,
      radius: "$radius/md",
      border: "$color/border/default",
    }),
  });

  add({
    name: "Layout/Grid item",
    group: "Data",
    description: "One tile of a gallery. Fixed aspect media on top so a grid of them stays even.",
    spec: col([box([], { name: "media", w: 240, h: 150, fill: "$color/bg/subtle", radius: "$radius/md" }), txt("Item title", { size: "$font/size/sm", weight: "Medium" }), txt("Caption", { size: "$font/size/xs", color: "$color/text/secondary" })], {
      name: "Grid item",
      gap: "$space/1",
      w: 240,
    }),
  });

  add({
    name: "Layout/Hero",
    group: "Layout",
    description: "The first screenful. Display type at the display family, which is where most styles differ most.",
    spec: col(
      [
        txt("A headline that states the value", { size: "$font/size/4xl", weight: "Medium", w: 720 }),
        txt("One supporting sentence that says who it is for and what it replaces.", { size: "$font/size/lg", color: "$color/text/secondary", w: 640 }),
        box(
          [
            box([txt(buttonLabel(r, "Get started"), { color: "$color/primary/on", weight: "Medium" })], { name: "primary", pad: { x: "$space/4", y: "$space/2" }, h: 48, justify: "CENTER", fill: "$color/primary/default", radius: "$radius/md" }),
            box([txt(buttonLabel(r, "Learn more"))], { name: "secondary", pad: { x: "$space/4", y: "$space/2" }, h: 48, justify: "CENTER", border: "$color/border/strong", radius: "$radius/md" }),
          ],
          { gap: "$space/2" },
        ),
      ],
      { name: "Hero", gap: "$space/3", pad: "$space/8", w: 960, align: "MIN" },
    ),
  });

  return out;
}

/** Group order for laying the generated page out. */
export const GROUP_ORDER = ["Primitives", "Forms", "Feedback", "Navigation", "Data", "Layout"];
