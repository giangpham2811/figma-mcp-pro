/**
 * Server-side half of the persona op: the cards are measured and the grid
 * laid out here, the plugin only draws.
 */
import { buildPersonas, type PersonaDiagramSpec } from "../shared/persona/index.js";
import type { AnyOperation } from "../shared/protocol.js";
import { validatePersonaSpec } from "./validate.js";

export type OpCall = (op: AnyOperation, params: Record<string, unknown>) => Promise<unknown>;

export interface PersonaResult {
  frameId?: string;
  name?: string;
  nodes?: Record<string, string>;
  box?: { x: number; y: number; w: number; h: number };
  dryRun?: boolean;
  warnings: string[];
  stats: {
    personas: number;
    primaries: number;
    actionable: number;
    w: number;
    h: number;
  };
}

/**
 * Check the set, lay it out, then draw it. Findings are reported whether or
 * not the drawing happens — a persona with no goals still draws, because
 * seeing the empty half of the card on the page is how the gap gets closed.
 */
export async function runPersona(
  rawSpec: unknown,
  call: OpCall,
  sink?: string[],
  /** Redraw into this existing frame instead of making a new one. */
  into?: string,
): Promise<PersonaResult> {
  const spec = validatePersonaSpec(rawSpec) as unknown as PersonaDiagramSpec;
  const built = buildPersonas(spec);
  if (sink) for (const w of built.warnings) if (!sink.includes(w)) sink.push(w);

  if (spec.options?.dryRun) {
    return { dryRun: true, warnings: built.warnings, stats: built.stats };
  }

  const draw = {
    ...built.draw,
    source: built.model,
    ...(into ? { intoFrameId: into } : {}),
  };
  const raw = await call("create_persona", draw as unknown as Record<string, unknown>);
  const { value, warnings: pluginWarnings } = unwrapWarned(raw);
  const warnings = built.warnings.slice();
  for (const w of pluginWarnings) if (!warnings.includes(w)) warnings.push(w);
  if (sink) for (const w of pluginWarnings) if (!sink.includes(w)) sink.push(w);

  return { ...((value ?? {}) as Partial<PersonaResult>), warnings, stats: built.stats };
}

function unwrapWarned(raw: unknown): { value: unknown; warnings: string[] } {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if ("result" in o && Array.isArray(o.warnings)) {
      return { value: o.result, warnings: o.warnings.map(String) };
    }
  }
  return { value: raw, warnings: [] };
}
