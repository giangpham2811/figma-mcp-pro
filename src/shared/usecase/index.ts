/**
 * usecase: actors and goals in → checked, laid-out draw data out.
 *
 * Same split as every other kind. The agent decides what is in scope; this
 * module places the boundary, runs the associations and proof-reads the
 * model. It never invents an actor and never guesses who starts what.
 */
import { checkUseCases } from "./check.js";
import { emitUseCaseDraw, layoutUseCases } from "./layout.js";
import { parseUseCaseText } from "./text.js";
import { fillDeep, unresolved } from "../model/policy.js";
import { DEFAULT_FONT } from "../diagram/palette.js";
import { needsWideCoverage } from "../diagram/metrics.js";
import type { ActorSpec, UseCaseBuild, UseCaseDiagramSpec, UseCaseSpec } from "./types.js";

export * from "./types.js";
export { parseUseCaseText } from "./text.js";
export { checkUseCases } from "./check.js";
export { layoutUseCases, emitUseCaseDraw, ellipseEdge } from "./layout.js";

export function buildUseCases(spec: UseCaseDiagramSpec): UseCaseBuild {
  const warnings: string[] = [];
  const options = spec.options ?? {};

  let actors: ActorSpec[] = spec.actors ?? [];
  let useCases: UseCaseSpec[] = spec.useCases ?? [];
  if (typeof spec.text === "string" && spec.text.trim()) {
    if (actors.length || useCases.length) {
      warnings.push(
        "Both `text` and `actors`/`useCases` were given — the text won. Pass one or the other.",
      );
    }
    const parsed = parseUseCaseText(spec.text);
    actors = parsed.actors;
    useCases = parsed.useCases;
    for (const w of parsed.warnings) warnings.push(w);
  }

  const checked = checkUseCases(actors, useCases);
  for (const w of checked.warnings) warnings.push(w);

  if (!options.font) {
    const sample: string[] = [];
    for (const a of checked.actors) {
      if (needsWideCoverage(`${a.label ?? ""} ${a.detail ?? ""}`)) sample.push(a.id);
    }
    for (const u of checked.useCases) {
      if (needsWideCoverage(`${u.label ?? ""} ${u.detail ?? ""}`)) sample.push(u.id);
    }
    if (sample.length) {
      warnings.push(
        `Labels on ${sample.slice(0, 6).join(", ")}${sample.length > 6 ? ` and ${sample.length - 6} more` : ""} use CJK/Hangul characters, which ${DEFAULT_FONT} cannot draw — Figma keeps the text but renders it BLANK. Pass options.font with a family that covers them (e.g. "Noto Sans KR", "Noto Sans JP"); check it exists first with figma_read get_fonts.`,
      );
    }
  }

  const policies = options.policies ?? {};
  const missing = unresolved({ actors: checked.actors, useCases: checked.useCases }, policies);
  if (missing.length) {
    warnings.push(
      `Nothing defines ${missing.map((n) => `\`@${n}\``).join(", ")}, so ${missing.length > 1 ? "those references are" : "that reference is"} drawn as written. Add ${missing.length > 1 ? "them" : "it"} to options.policies, or drop the \`@\`.`,
    );
  }
  const drawn = fillDeep(
    { actors: checked.actors, useCases: checked.useCases },
    policies,
  ) as { actors: ActorSpec[]; useCases: UseCaseSpec[] };

  const title = spec.title || "Use cases";
  const laid = layoutUseCases(drawn.actors, drawn.useCases, options, spec.subtitle ?? "", title);
  const draw = emitUseCaseDraw(
    laid,
    {
      title,
      subtitle: spec.subtitle ?? "",
      name: `Use case · ${title}`,
      x: spec.x ?? 0,
      y: spec.y ?? 0,
      ...(spec.parentId ? { parentId: spec.parentId } : {}),
    },
    options,
  );

  return {
    draw,
    model: {
      title,
      ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
      actors: checked.actors,
      useCases: checked.useCases,
      ...(spec.options ? { options: spec.options } : {}),
    },
    warnings,
    stats: {
      actors: checked.actors.length,
      useCases: checked.useCases.length,
      associations: laid.links.filter((l) => l.kind === "association").length,
      orphans: laid.useCases.filter((u) => u.orphan).length,
      w: draw.w,
      h: draw.h,
    },
  };
}
