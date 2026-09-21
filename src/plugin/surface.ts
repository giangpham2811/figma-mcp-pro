/// <reference types="@figma/plugin-typings" />
/**
 * Which editor the plugin is running in, and what that editor can do.
 *
 * FigJam is not a cut-down Figma Design. It is a different canvas with a
 * different vocabulary, and the difference runs in BOTH directions:
 *
 *   FigJam has, and Design does not:
 *     - ConnectorNode. A real connector that binds to a node by id with
 *       `magnet: "AUTO"` and re-routes itself when the node moves.
 *     - ShapeWithTextNode. A shape whose text lives inside it and centres
 *       itself, with the flowchart vocabulary (DIAMOND, ENG_DATABASE, …).
 *     - StickyNode, SectionNode, TableNode as first-class things.
 *
 *   Design has, and FigJam does not:
 *     - auto-layout, components, variants, variables, text/effect styles,
 *       constraints, prototype reactions.
 *
 * That first list is why this is worth doing at all. Everything in
 * `shared/<kind>/route.ts`, `diagram-reflow.ts` and the live watcher exists
 * because Design has no connector and something has to move the arrows when
 * a box is dragged. On FigJam none of it is needed: the connector does it.
 * So the FigJam renderer is SMALLER than the Design one, not larger.
 *
 * The second list is why a capability gate is needed rather than optimism.
 * `generate_design_system` on a FigJam board is not a degraded experience,
 * it is meaningless — there are no components to generate. An op that says
 * so is worth far more than one that throws `figma.createComponent is not a
 * function` three calls in.
 */
import { err } from "./errors.js";
import { ErrorCode } from "../shared/protocol.js";

export type Surface = "figma" | "figjam" | "other";

export function surface(): Surface {
  // `editorType` is absent on very old runtimes and in test mocks; treating
  // an unknown editor as Design keeps every existing path working, which is
  // the safer default of the two.
  const t = (figma as unknown as { editorType?: string }).editorType;
  if (t === "figjam") return "figjam";
  if (t === "figma") return "figma";
  return "other";
}

export function isFigJam(): boolean {
  return surface() === "figjam";
}

/**
 * Ops that need something FigJam does not have.
 *
 * Grouped by the reason, because the reason is what the caller needs: a
 * missing component model is a different problem from a missing prototype,
 * and the hint differs.
 */
const NEEDS_COMPONENTS = [
  "find_component",
  "find_or_create_component",
  "componentize",
  "instantiate",
  "create_variants",
  "arrange_component_set",
  "set_component_description",
  "add_component_property",
  "edit_component_property",
  "delete_component_property",
  "get_instance_overrides",
  "set_instance_overrides",
  "set_instance_properties",
  "expose_nested_instance",
  "detach_instance",
  "reset_instance_overrides",
  "match_main_values",
  "get_component",
  "get_components",
  "get_library_component",
  "generate_design_system",
  "apply_design_system",
  "audit_design_system",
  "get_design_system_kit",
  "generate_design_md",
  "design_fingerprint",
] as const;

const NEEDS_STYLES_OR_VARIABLES = [
  "setup_tokens",
  "setup_text_styles",
  "setup_effect_styles",
  "set_text_style",
  "apply_variable",
  "create_variable",
  "update_variable",
  "rename_variable",
  "delete_variable",
  "export_tokens",
  "import_tokens",
  "get_styles",
  "get_variables",
  "delete_style",
  "delete_unused_styles",
] as const;

const NEEDS_PROTOTYPE = ["set_reactions", "build_demo", "play_demo"] as const;

/**
 * Audits that measure something FigJam has no notion of.
 *
 * A11y contrast would technically compute on a sticky note, and that is
 * exactly why it is blocked: a board is not a shipped interface, so every
 * finding would be noise about a whiteboard. Responsive is the same —
 * nothing on a board has a viewport.
 */
const NEEDS_DESIGN_SEMANTICS = [
  "a11y_audit",
  "responsive_audit",
  "layout_audit",
] as const;

/**
 * Kinds whose MEANING does not survive the translation.
 *
 * Only one so far, and it is worth the paragraph. A sequence diagram's
 * vertical axis is TIME: message 3 is below message 2 because it happens
 * after it. A FigJam connector binds to a node, not to a point on a
 * lifeline, so every message between the same two participants would land
 * on the same line and the ordering — the entire content of the diagram —
 * would be gone. It would still look like a sequence diagram, which is the
 * problem: a drawing that reads right and says nothing is worse than an
 * error.
 */
const MEANING_LOST_ON_BOARD: Record<string, string> = {
  create_sequence:
    'A sequence diagram puts TIME on the vertical axis, and a FigJam connector binds to a node rather than to a point on a lifeline — every message between the same two participants would collapse onto one line and the ordering would be lost.',
};

export interface Unsupported {
  message: string;
  hint: string;
}

/** Why this op cannot run here, or null when it can. */
export function unsupportedInFigJam(op: string): Unsupported | null {
  if ((NEEDS_COMPONENTS as readonly string[]).includes(op)) {
    return {
      message: `"${op}" needs Figma Design: FigJam has no components, variants or instances.`,
      hint: "Open a Design file for design-system work. Diagrams, sitemaps, journeys and personas all draw on FigJam — those are what this plugin is for on a board.",
    };
  }
  if ((NEEDS_STYLES_OR_VARIABLES as readonly string[]).includes(op)) {
    return {
      message: `"${op}" needs Figma Design: FigJam has no shared styles or variables.`,
      hint: "Tokens live in a Design file. On a board, pass colours directly — options.font still works for the diagram kinds.",
    };
  }
  if ((NEEDS_PROTOTYPE as readonly string[]).includes(op)) {
    return {
      message: `"${op}" needs Figma Design: FigJam has no prototype layer.`,
      hint: "A FigJam connector is a drawn relationship, not a clickable link. Build the click-through in a Design file.",
    };
  }
  const lost = MEANING_LOST_ON_BOARD[op];
  if (lost) {
    return {
      message: `${lost} Draw it in a Figma Design file.`,
      hint: 'If what you need on the board is who does what rather than in what order, figma_diagram type:"activity" says that and draws correctly here.',
    };
  }
  if ((NEEDS_DESIGN_SEMANTICS as readonly string[]).includes(op)) {
    return {
      message: `"${op}" measures a shipped interface, and a FigJam board is not one.`,
      hint: "Run it on the Design file that holds the screens. The diagram checkers still run here and report on the MODEL, which is the thing a board is for.",
    };
  }
  return null;
}

/** Throw the gate error for an op that cannot run on this surface. */
export function assertSupported(op: string): void {
  if (!isFigJam()) return;
  const no = unsupportedInFigJam(op);
  if (no) throw err(ErrorCode.UNSUPPORTED_OPERATION, no.message, no.hint);
}
