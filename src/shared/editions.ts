/**
 * What this build can do, and what a caller is told when it reaches for
 * something not built yet.
 *
 * This fork starts from the MIT free edition and grows the authoring half
 * back. The lists below are therefore a BACKLOG, not a paywall: an op leaves
 * a list the moment its handler lands, and until then the caller gets a
 * straight "not implemented here yet" rather than a bare "unknown tool",
 * which reads as a bug and sends people debugging their own prompt.
 *
 * Provenance: the free edition is MIT (Hoang Phan); see LICENSE and NOTICE.
 * Everything in the authoring layer is written against Figma's public Plugin
 * API from the published feature list — no upstream Pro code is used.
 */

export const UPSTREAM_REPO_URL = "https://github.com/hoangpm96/reqwise-figma-mcp";
/** Kept under the old name so existing hint text and tests still resolve. */
export const FREE_REPO_URL = UPSTREAM_REPO_URL;
export const PRO_URL = UPSTREAM_REPO_URL;

export const EDITION: "free" | "pro" = "pro";

/** MCP tools not implemented in this build yet. */
export const PRO_TOOLS = ["figma_design_system", "figma_record"] as const;

/** figma_diagram kinds not implemented yet. */
export const PRO_DIAGRAM_KINDS = ["journey", "persona", "usecase"] as const;

/** Plugin operations (figma_read ops and figma.* write methods) that exist only in Pro. */
export const PRO_OPERATIONS = [
  "a11y_audit",
  "responsive_audit",
  "list_demos",
  "get_demo_spec",
  "create_usecase",
  "create_journey",
  "create_persona",
  "build_demo",
  "delete_demo",
  "play_demo",
] as const;

/** figma.* sandbox methods that exist only in Pro (camelCase names agents call). */
export const PRO_METHODS = [
  "buildDemo",
  "playDemo",
  "deleteDemo",
  "listDemos",
  "getDemoSpec",
  "loadAvatar",
] as const;

export function isProFeature(name: string): boolean {
  return (
    (PRO_TOOLS as readonly string[]).includes(name) ||
    (PRO_DIAGRAM_KINDS as readonly string[]).includes(name) ||
    (PRO_OPERATIONS as readonly string[]).includes(name) ||
    (PRO_METHODS as readonly string[]).includes(name)
  );
}

/** What a caller is told when it reaches for something not built yet. */
export function proFeatureMessage(name: string): { message: string; hint: string } {
  return {
    message: `"${name}" is not implemented in this build yet.`,
    hint: `It is on the roadmap in src/shared/editions.ts. Everything already implemented keeps working without it; upstream free edition: ${UPSTREAM_REPO_URL}.`,
  };
}
