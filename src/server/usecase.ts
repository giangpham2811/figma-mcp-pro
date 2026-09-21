/**
 * Server-side half of the use case op: the boundary, the ovals and the
 * associations are computed here, the plugin only draws.
 */
import { buildUseCases, type UseCaseDiagramSpec } from "../shared/usecase/index.js";
import type { AnyOperation } from "../shared/protocol.js";
import { validateUseCaseSpec } from "./validate.js";

export type OpCall = (op: AnyOperation, params: Record<string, unknown>) => Promise<unknown>;

export interface UseCaseResult {
  frameId?: string;
  name?: string;
  nodes?: Record<string, string>;
  box?: { x: number; y: number; w: number; h: number };
  dryRun?: boolean;
  warnings: string[];
  stats: {
    actors: number;
    useCases: number;
    associations: number;
    orphans: number;
    w: number;
    h: number;
  };
}

/**
 * Check the model, lay it out, then draw it. An orphaned use case still
 * draws — in amber — because the point of the boundary is to argue about it
 * on a wall, and a finding that only exists in a warnings array does not get
 * argued about.
 */
export async function runUseCase(
  rawSpec: unknown,
  call: OpCall,
  sink?: string[],
  into?: string,
): Promise<UseCaseResult> {
  const spec = validateUseCaseSpec(rawSpec) as unknown as UseCaseDiagramSpec;
  const built = buildUseCases(spec);
  if (sink) for (const w of built.warnings) if (!sink.includes(w)) sink.push(w);

  if (spec.options?.dryRun) {
    return { dryRun: true, warnings: built.warnings, stats: built.stats };
  }

  const draw = {
    ...built.draw,
    source: built.model,
    ...(into ? { intoFrameId: into } : {}),
  };
  const raw = await call("create_usecase", draw as unknown as Record<string, unknown>);
  const { value, warnings: pluginWarnings } = unwrapWarned(raw);
  const warnings = built.warnings.slice();
  for (const w of pluginWarnings) if (!warnings.includes(w)) warnings.push(w);
  if (sink) for (const w of pluginWarnings) if (!sink.includes(w)) sink.push(w);

  return { ...((value ?? {}) as Partial<UseCaseResult>), warnings, stats: built.stats };
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
