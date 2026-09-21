/// <reference types="@figma/plugin-typings" />
/**
 * a11y_audit and responsive_audit.
 *
 * Both are built on the same rule the existing `layout_audit` follows: report
 * only what carries a finding, and make every finding actionable — a node id,
 * a measured number, and the number it needed to be. A report that says
 * "3 accessibility issues" without saying which layer is a report nobody acts
 * on.
 *
 * What these deliberately do NOT do is guess at intent. There is no check for
 * "colour is the only signal", no reading-order check, no alt-text check,
 * because a static Figma tree cannot tell a decorative divider from a
 * meaningful one and a checker that cries wolf gets muted, which costs more
 * than it ever saved. Every rule below is one a machine can be certain about.
 */
import { HandlerContext, requireNode } from "../context.js";
import { r2 } from "../num.js";
import {
  contrastRatio,
  rgbToHex,
  compositeOver,
  type RGB,
} from "../color-util.js";
import {
  effectiveBackground,
  firstSolidFillRgba,
  wcagMinRatio,
} from "./audit.js";

/** WCAG 2.5.8 / platform guidance: the smallest target that is reliably hit. */
const MIN_TARGET = 44;
/** Below this, text is unreadable on a phone whatever the contrast. */
const MIN_FONT = 12;

export interface A11yFinding {
  rule: string;
  id: string;
  name: string;
  severity: "error" | "warning";
  detail: string;
  /** What was measured and what was required, when both are numbers. */
  measured?: number;
  required?: number;
}

/**
 * Names that mean "a user taps this".
 *
 * Name-sniffing is a heuristic and is treated as one: a node matching this
 * AND being too small is a warning, while a node with real prototype
 * reactions and being too small is an error. Figma has no "this is a button"
 * flag, so the alternative to a heuristic is no check at all.
 */
const INTERACTIVE_NAME =
  /\b(button|btn|cta|link|tab|chip|toggle|switch|checkbox|radio|icon[- ]?button|close|menu[- ]?item|nav[- ]?item)\b/i;

function isInteractive(node: SceneNode): { yes: boolean; certain: boolean } {
  const reactions = (node as SceneNode & { reactions?: readonly unknown[] }).reactions;
  if (Array.isArray(reactions) && reactions.length > 0) return { yes: true, certain: true };
  if (INTERACTIVE_NAME.test(node.name)) return { yes: true, certain: false };
  return { yes: false, certain: false };
}

/**
 * The effective foreground of a text node, composited onto its background.
 *
 * Text at 60% opacity over white is not its own hex — it is the blend, and
 * measuring the raw fill is how a "secondary" grey passes an audit and fails
 * a user. `compositeOver` already exists for exactly this.
 */
function textForeground(node: TextNode, bg: RGB): RGB | null {
  const rgba = firstSolidFillRgba(node);
  if (!rgba) return null;
  const alpha = rgba.a * (node.opacity ?? 1);
  return compositeOver({ ...rgba, a: alpha }, bg);
}

/** a11y_audit — contrast, target size, and text that is simply too small. */
export async function a11yAudit(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const root =
    typeof p.nodeId === "string"
      ? await requireNode(p.nodeId)
      : (figma.currentPage.selection[0] ?? figma.currentPage);

  const nodes =
    "findAll" in root
      ? [
          ...(root.type === "PAGE" ? [] : [root as SceneNode]),
          ...(root as ChildrenMixin).findAll(() => true),
        ]
      : [root as SceneNode];

  const findings: A11yFinding[] = [];
  let textChecked = 0;
  let targetsChecked = 0;
  let skippedNoBackground = 0;

  for (const node of nodes) {
    if (node.visible === false) continue;

    // --- contrast -----------------------------------------------------
    if (node.type === "TEXT") {
      const bg = effectiveBackground(node);
      if (!bg) {
        // No filled ancestor: the node sits on bare canvas. Assuming white
        // here invents findings, so it is counted and skipped.
        skippedNoBackground++;
      } else {
        const fg = textForeground(node as TextNode, bg);
        if (fg) {
          textChecked++;
          const ratio = r2(contrastRatio(fg, bg));
          const required = wcagMinRatio(node as TextNode);
          if (ratio < required) {
            findings.push({
              rule: "contrast",
              id: node.id,
              name: node.name,
              severity: "error",
              detail: `${rgbToHex(fg)} on ${rgbToHex(bg)} is ${ratio}:1`,
              measured: ratio,
              required,
            });
          }
        }
      }

      const size = (node as TextNode).fontSize;
      if (size !== figma.mixed && (size as number) < MIN_FONT) {
        findings.push({
          rule: "text-size",
          id: node.id,
          name: node.name,
          severity: "warning",
          detail: `${size as number}px is below the ${MIN_FONT}px floor for body text`,
          measured: size as number,
          required: MIN_FONT,
        });
      }
    }

    // --- target size --------------------------------------------------
    const interactive = isInteractive(node);
    if (interactive.yes && "width" in node) {
      targetsChecked++;
      const w = r2(node.width);
      const h = r2(node.height);
      if (w < MIN_TARGET || h < MIN_TARGET) {
        findings.push({
          rule: "target-size",
          id: node.id,
          name: node.name,
          severity: interactive.certain ? "error" : "warning",
          detail: interactive.certain
            ? `${w}×${h} — this node has prototype reactions, so it is definitely a target`
            : `${w}×${h} — the name suggests a control; if it is one, it is too small`,
          measured: Math.min(w, h),
          required: MIN_TARGET,
        });
      }
    }
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  return {
    rootId: "id" in root ? root.id : null,
    nodesScanned: nodes.length,
    textChecked,
    targetsChecked,
    findings,
    errors,
    warnings: findings.length - errors,
    ...(skippedNoBackground > 0
      ? {
          skippedNoBackground,
          note: `${skippedNoBackground} text node(s) had no filled ancestor, so contrast could not be measured. Give the frame a background fill, or audit a node that has one.`,
        }
      : {}),
    verdict:
      findings.length === 0
        ? "No findings. Contrast, target size and text size all clear."
        : `${errors} error(s), ${findings.length - errors} warning(s). Contrast and target size are the two that block a release.`,
  };
}

// ---------------------------------------------------------------------------
// responsive_audit
// ---------------------------------------------------------------------------

export interface ResponsiveFinding {
  rule: string;
  id: string;
  name: string;
  detail: string;
  width?: number;
}

const DEFAULT_WIDTHS = [375, 768, 1440];

/**
 * responsive_audit — will this survive a narrower viewport?
 *
 * Two modes, and the default is the safe one.
 *
 * STATIC (default) reads the layout tree for the constructions that cannot
 * reflow: a fixed width wider than the narrowest target, a text node set to
 * hug inside a fixed parent, an absolutely positioned child of an
 * auto-layout frame, a row of several fixed-width children with no wrap.
 * These are certain from the tree alone.
 *
 * SIMULATE (`simulate: true`) actually resizes the frame to each width,
 * measures what overflows, and puts it back. It finds what static analysis
 * cannot — but it MUTATES THE USER'S FILE for the duration, so the restore
 * is in a `finally` and the original geometry is captured before anything
 * moves. A crash mid-sweep otherwise leaves somebody's artboard at 375px
 * wide with no undo entry they recognise.
 */
export async function responsiveAudit(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const root = await requireNode(p.nodeId ?? p.id);
  const widths = Array.isArray(p.widths)
    ? (p.widths as number[]).filter((w) => typeof w === "number" && w > 0)
    : DEFAULT_WIDTHS;
  const narrowest = Math.min(...widths);
  const findings: ResponsiveFinding[] = [];

  const all = [
    root as SceneNode,
    ...("findAll" in root ? (root as ChildrenMixin).findAll(() => true) : []),
  ];

  for (const node of all) {
    if (node.visible === false) continue;
    const parent = node.parent;
    const inAutoLayout =
      parent && "layoutMode" in parent && (parent as FrameNode).layoutMode !== "NONE";

    // A child that opted out of the parent's layout will not move when the
    // parent narrows — it will just be clipped.
    if (inAutoLayout && "layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE") {
      findings.push({
        rule: "absolute-in-autolayout",
        id: node.id,
        name: node.name,
        detail: "positioned ABSOLUTE inside an auto-layout parent — it will not reflow when the parent narrows",
      });
    }

    // A fixed width wider than the narrowest target cannot fit, whatever the
    // parent does. Only checked on the node's own frame, not on text.
    if ("width" in node && node.type !== "TEXT") {
      const growing = "layoutGrow" in node && (node as FrameNode).layoutGrow === 1;
      const stretches = "layoutAlign" in node && node.layoutAlign === "STRETCH";
      const hugs =
        "layoutMode" in node &&
        (node as FrameNode).layoutMode !== "NONE" &&
        (node as FrameNode).counterAxisSizingMode === "AUTO";
      if (!growing && !stretches && !hugs && node.width > narrowest) {
        findings.push({
          rule: "fixed-too-wide",
          id: node.id,
          name: node.name,
          detail: `fixed ${r2(node.width)}px with no grow/stretch/hug — wider than the ${narrowest}px target`,
          width: r2(node.width),
        });
      }
    }

    // Text that sizes to its own content inside a fixed parent runs out of
    // the parent instead of wrapping. This is the single most common cause
    // of "the copy is cut off on mobile".
    if (node.type === "TEXT") {
      const t = node as TextNode;
      if (t.textAutoResize === "WIDTH_AND_HEIGHT" && inAutoLayout) {
        const parentFixed =
          (parent as FrameNode).counterAxisSizingMode === "FIXED" ||
          (parent as FrameNode).primaryAxisSizingMode === "FIXED";
        if (parentFixed && t.width > narrowest * 0.8) {
          findings.push({
            rule: "text-will-not-wrap",
            id: node.id,
            name: node.name,
            detail: `textAutoResize is WIDTH_AND_HEIGHT (hug) at ${r2(t.width)}px inside a fixed parent — set it to HEIGHT so the copy wraps`,
            width: r2(t.width),
          });
        }
      }
    }

    // A horizontal row of several fixed children with no wrap is a row that
    // overflows rather than stacking.
    if ("layoutMode" in node && (node as FrameNode).layoutMode === "HORIZONTAL") {
      const f = node as FrameNode;
      const kids = f.children.filter((c) => c.visible !== false);
      if (kids.length >= 3 && f.layoutWrap !== "WRAP") {
        const sum =
          kids.reduce((a, c) => a + ("width" in c ? c.width : 0), 0) +
          f.itemSpacing * (kids.length - 1) +
          f.paddingLeft +
          f.paddingRight;
        if (sum > narrowest) {
          findings.push({
            rule: "row-will-not-wrap",
            id: node.id,
            name: node.name,
            detail: `${kids.length} children need ${r2(sum)}px on one line with layoutWrap NO_WRAP — over the ${narrowest}px target`,
            width: r2(sum),
          });
        }
      }
    }
  }

  const result: Record<string, unknown> = {
    rootId: root.id,
    widths,
    mode: p.simulate === true ? "simulate" : "static",
    nodesScanned: all.length,
    findings,
    verdict:
      findings.length === 0
        ? `Nothing in this subtree is structurally unable to reach ${narrowest}px.`
        : `${findings.length} construction(s) cannot reflow to ${narrowest}px.`,
  };

  if (p.simulate !== true) {
    result.hint =
      "Static analysis only — it finds constructions that CANNOT reflow, not everything that looks wrong. Pass simulate: true to resize the frame at each width and measure real overflow (the frame is restored afterwards).";
    return result;
  }

  // --- simulation ----------------------------------------------------
  if (!("resize" in root) || !("width" in root)) {
    result.simulation = { skipped: "root node cannot be resized" };
    return result;
  }
  const frame = root as FrameNode;
  const original = { w: frame.width, h: frame.height };
  const overflow: Array<{ width: number; overflowing: Array<{ id: string; name: string; by: number }> }> = [];

  try {
    for (const w of widths) {
      frame.resize(w, frame.height);
      const box = frame.absoluteBoundingBox;
      const out: Array<{ id: string; name: string; by: number }> = [];
      if (box) {
        for (const kid of frame.findAll(() => true)) {
          const kb = kid.absoluteBoundingBox;
          if (!kb) continue;
          const by = Math.max(0, r2(kb.x + kb.width - (box.x + box.width)));
          if (by > 0.5) out.push({ id: kid.id, name: kid.name, by });
        }
      }
      overflow.push({ width: w, overflowing: out.slice(0, 25) });
      ctx.progress(overflow.length, widths.length, `measured ${w}px`);
    }
  } finally {
    // Always, even on a throw. Leaving somebody's artboard at 375px with no
    // recognisable undo entry is a worse outcome than an incomplete audit.
    frame.resize(original.w, original.h);
  }

  result.simulation = overflow;
  result.verdict = `${findings.length} static finding(s); ${overflow
    .map((o) => `${o.width}px: ${o.overflowing.length} overflowing`)
    .join(", ")}. Frame restored to ${r2(original.w)}×${r2(original.h)}.`;
  return result;
}
