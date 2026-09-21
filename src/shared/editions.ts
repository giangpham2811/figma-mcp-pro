/**
 * What this build can do, and what a caller is told when it reaches for
 * something not built yet.
 *
 * This fork started from the MIT free edition and grew the authoring half
 * back. The lists below are a BACKLOG, not a paywall: an op leaves its list
 * the moment its handler lands, and until then the caller gets a straight
 * "not implemented here yet" rather than a bare "unknown tool", which reads
 * as a bug and sends people debugging their own prompt.
 *
 * **Every list is now empty.** That is the finished state, not a mistake —
 * the whole surface the upstream free edition names as missing is
 * implemented here. The lists and `isProFeature` stay because the next thing
 * somebody starts and does not finish belongs in them, and because a
 * half-built op wants this message rather than UNSUPPORTED_OPERATION.
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
export const PRO_TOOLS: readonly string[] = [];

/** figma_diagram kinds not implemented yet. */
export const PRO_DIAGRAM_KINDS: readonly string[] = [];

/** Plugin operations (figma_read ops and figma.* write methods) not built yet. */
export const PRO_OPERATIONS: readonly string[] = [];

/** figma.* sandbox methods (camelCase names agents call) not built yet. */
export const PRO_METHODS: readonly string[] = [];

export function isProFeature(name: string): boolean {
  return (
    PRO_TOOLS.includes(name) ||
    PRO_DIAGRAM_KINDS.includes(name) ||
    PRO_OPERATIONS.includes(name) ||
    PRO_METHODS.includes(name)
  );
}

/** What a caller is told when it reaches for something not built yet. */
export function proFeatureMessage(name: string): { message: string; hint: string } {
  return {
    message: `"${name}" is not implemented in this build yet.`,
    hint: `It is on the roadmap in src/shared/editions.ts. Everything already implemented keeps working without it; upstream free edition: ${UPSTREAM_REPO_URL}.`,
  };
}
