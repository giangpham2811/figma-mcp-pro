/**
 * Server-side half of the journey op: the grid and the emotion curve are
 * computed here, the plugin only draws.
 */
import { buildJourney, type JourneySpec, type Feeling } from "../shared/journey/index.js";
import type { AnyOperation } from "../shared/protocol.js";
import { validateJourneySpec } from "./validate.js";

export type OpCall = (op: AnyOperation, params: Record<string, unknown>) => Promise<unknown>;

export interface JourneyResult {
  frameId?: string;
  name?: string;
  nodes?: Record<string, string>;
  box?: { x: number; y: number; w: number; h: number };
  dryRun?: boolean;
  warnings: string[];
  stats: {
    stages: number;
    served: number;
    pains: number;
    opportunities: number;
    low: Feeling;
    w: number;
    h: number;
  };
}

/**
 * Check the stages, lay the grid out, then draw it. Findings are reported
 * whether or not the drawing happens — a stage with no touchpoint still
 * draws, because the empty cell on the page is how the gap gets discussed.
 */
export async function runJourney(
  rawSpec: unknown,
  call: OpCall,
  sink?: string[],
  into?: string,
): Promise<JourneyResult> {
  const spec = validateJourneySpec(rawSpec) as unknown as JourneySpec;
  const built = buildJourney(spec);
  if (sink) for (const w of built.warnings) if (!sink.includes(w)) sink.push(w);

  if (spec.options?.dryRun) {
    return { dryRun: true, warnings: built.warnings, stats: built.stats };
  }

  const draw = {
    ...built.draw,
    source: built.model,
    ...(into ? { intoFrameId: into } : {}),
  };
  const raw = await call("create_journey", draw as unknown as Record<string, unknown>);
  const { value, warnings: pluginWarnings } = unwrapWarned(raw);
  const warnings = built.warnings.slice();
  for (const w of pluginWarnings) if (!warnings.includes(w)) warnings.push(w);
  if (sink) for (const w of pluginWarnings) if (!sink.includes(w)) sink.push(w);

  return { ...((value ?? {}) as Partial<JourneyResult>), warnings, stats: built.stats };
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
