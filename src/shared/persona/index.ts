/**
 * persona: who this is for in → checked, laid-out draw data out.
 *
 * Same split as every other kind. The agent does the thinking (read the
 * research, work out who these people are); this module measures the cards,
 * lays the grid out and proof-reads the set. It never invents a goal and
 * never guesses a role.
 */
import { checkPersonas } from "./check.js";
import { emitPersonaDraw, layoutPersonas } from "./layout.js";
import { parsePersonaText } from "./text.js";
import { fillDeep, unresolved } from "../model/policy.js";
import { DEFAULT_FONT } from "../diagram/palette.js";
import { needsWideCoverage } from "../diagram/metrics.js";
import type { PersonaBuild, PersonaDiagramSpec, PersonaSpec } from "./types.js";

export * from "./types.js";
export { parsePersonaText } from "./text.js";
export { checkPersonas } from "./check.js";
export { layoutPersonas, emitPersonaDraw, initialsOf } from "./layout.js";

export function buildPersonas(spec: PersonaDiagramSpec): PersonaBuild {
  const warnings: string[] = [];
  const options = spec.options ?? {};

  // The compact form is an alternative INPUT, not a second model.
  let personas: PersonaSpec[] = spec.personas ?? [];
  if (typeof spec.text === "string" && spec.text.trim()) {
    if (personas.length) {
      warnings.push("Both `text` and `personas` were given — the text won. Pass one or the other.");
    }
    const parsed = parsePersonaText(spec.text);
    personas = parsed.personas;
    for (const w of parsed.warnings) warnings.push(w);
  }

  const checked = checkPersonas(personas);
  for (const w of checked.warnings) warnings.push(w);

  // Inter has no CJK/Hangul glyphs: Figma keeps the characters and draws
  // nothing, so a Vietnamese-authored persona set comes out blank with no
  // error anywhere. Personas are the kind most likely to hit this, because
  // the quote is verbatim from a real interview.
  if (!options.font) {
    const sample: string[] = [];
    for (const p of checked.personas) {
      const text = [p.name, p.title, p.quote, p.scenario, ...(p.goals ?? []), ...(p.frustrations ?? [])]
        .filter(Boolean)
        .join(" ");
      if (needsWideCoverage(text)) sample.push(p.id);
    }
    if (sample.length) {
      warnings.push(
        `Text on ${sample.slice(0, 6).join(", ")}${sample.length > 6 ? ` and ${sample.length - 6} more` : ""} uses CJK/Hangul characters, which ${DEFAULT_FONT} cannot draw — Figma keeps the text but renders it BLANK. Pass options.font with a family that covers them (e.g. "Noto Sans KR", "Noto Sans JP"); check it exists first with figma_read get_fonts.`,
      );
    }
  }

  // The label references the rule; the DRAWING carries its value. Filling in
  // happens between the checker and the layout, so the stored model keeps the
  // reference and the page can still be asked which frames depend on it.
  const policies = options.policies ?? {};
  const missing = unresolved({ personas: checked.personas }, policies);
  if (missing.length) {
    warnings.push(
      `Nothing defines ${missing.map((n) => `\`@${n}\``).join(", ")}, so ${missing.length > 1 ? "those references are" : "that reference is"} drawn as written. Add ${missing.length > 1 ? "them" : "it"} to options.policies, or drop the \`@\`.`,
    );
  }
  const drawn = fillDeep({ personas: checked.personas }, policies) as { personas: PersonaSpec[] };

  const laid = layoutPersonas(drawn.personas, options, spec.subtitle ?? "");
  const title = spec.title || "Personas";
  const draw = emitPersonaDraw(
    laid,
    {
      title,
      subtitle: spec.subtitle ?? "",
      name: `Persona · ${title}`,
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
      personas: checked.personas,
      ...(spec.options ? { options: spec.options } : {}),
    },
    warnings,
    stats: {
      personas: checked.personas.length,
      primaries: checked.personas.filter((p) => p.role === "primary").length,
      actionable: checked.personas.filter(
        (p) => (p.goals?.length ?? 0) > 0 && (p.frustrations?.length ?? 0) > 0,
      ).length,
      w: draw.w,
      h: draw.h,
    },
  };
}
