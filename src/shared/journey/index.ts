/**
 * journey: stages in → checked, laid-out draw data out.
 *
 * Same split as every other kind: the agent works out what the phases are,
 * this module measures the grid, places the emotion curve and proof-reads
 * the model. It never invents a stage and never guesses a feeling.
 */
import { checkJourney } from "./check.js";
import { emitJourneyDraw, layoutJourney } from "./layout.js";
import { parseJourneyText } from "./text.js";
import { fillDeep, unresolved } from "../model/policy.js";
import { DEFAULT_FONT } from "../diagram/palette.js";
import { needsWideCoverage } from "../diagram/metrics.js";
import type { Feeling, JourneyBuild, JourneySpec, StageSpec } from "./types.js";

export * from "./types.js";
export { parseJourneyText } from "./text.js";
export { checkJourney } from "./check.js";
export { layoutJourney, emitJourneyDraw } from "./layout.js";

export function buildJourney(spec: JourneySpec): JourneyBuild {
  const warnings: string[] = [];
  const options = spec.options ?? {};

  let stages: StageSpec[] = spec.stages ?? [];
  if (typeof spec.text === "string" && spec.text.trim()) {
    if (stages.length) {
      warnings.push("Both `text` and `stages` were given — the text won. Pass one or the other.");
    }
    const parsed = parseJourneyText(spec.text);
    stages = parsed.stages;
    for (const w of parsed.warnings) warnings.push(w);
  }

  const checked = checkJourney(stages);
  for (const w of checked.warnings) warnings.push(w);

  if (!options.font) {
    const sample: string[] = [];
    for (const s of checked.stages) {
      const text = [s.label, ...(s.doing ?? []), ...(s.thinking ?? []), ...(s.pains ?? [])]
        .filter(Boolean)
        .join(" ");
      if (needsWideCoverage(text)) sample.push(s.id);
    }
    if (sample.length) {
      warnings.push(
        `Text on ${sample.slice(0, 6).join(", ")}${sample.length > 6 ? ` and ${sample.length - 6} more` : ""} uses CJK/Hangul characters, which ${DEFAULT_FONT} cannot draw — Figma keeps the text but renders it BLANK. Pass options.font with a family that covers them (e.g. "Noto Sans KR", "Noto Sans JP"); check it exists first with figma_read get_fonts.`,
      );
    }
  }

  const policies = options.policies ?? {};
  const missing = unresolved({ stages: checked.stages }, policies);
  if (missing.length) {
    warnings.push(
      `Nothing defines ${missing.map((n) => `\`@${n}\``).join(", ")}, so ${missing.length > 1 ? "those references are" : "that reference is"} drawn as written. Add ${missing.length > 1 ? "them" : "it"} to options.policies, or drop the \`@\`.`,
    );
  }
  const drawn = fillDeep({ stages: checked.stages }, policies) as { stages: StageSpec[] };

  const laid = layoutJourney(drawn.stages, options, spec.subtitle ?? "");
  const title = spec.title || "Journey";
  const draw = emitJourneyDraw(
    laid,
    {
      title,
      subtitle: spec.subtitle ?? "",
      persona: spec.persona ?? "",
      name: `Journey · ${title}`,
      x: spec.x ?? 0,
      y: spec.y ?? 0,
      ...(spec.parentId ? { parentId: spec.parentId } : {}),
    },
    options,
  );

  const feelings = checked.stages
    .map((s) => s.feeling)
    .filter((f): f is Feeling => f !== undefined);

  return {
    draw,
    model: {
      title,
      ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
      ...(spec.persona ? { persona: spec.persona } : {}),
      stages: checked.stages,
      ...(spec.options ? { options: spec.options } : {}),
    },
    warnings,
    stats: {
      stages: checked.stages.length,
      served: checked.stages.filter((s) => (s.touchpoints?.length ?? 0) > 0).length,
      pains: checked.stages.reduce((a, s) => a + (s.pains?.length ?? 0), 0),
      opportunities: checked.stages.reduce((a, s) => a + (s.opportunities?.length ?? 0), 0),
      low: feelings.length ? (Math.min(...feelings) as Feeling) : 0,
      w: draw.w,
      h: draw.h,
    },
  };
}
