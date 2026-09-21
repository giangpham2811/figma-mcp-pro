/**
 * The journey proof-reader.
 *
 * It reports the MODEL, not the drawing, and it is silent when the model is
 * sound. Each rule below is one a machine can be certain about from the
 * stages alone, and each carries the exemption that makes its silence
 * deliberate — a checker that fires on a short honest journey gets muted and
 * then never catches the dishonest one.
 *
 * The rule worth reading is the flat-emotion one. A journey map whose
 * emotion track never moves has not been researched: somebody filled in a
 * table. That is the single most common way this artefact is faked, and it
 * is invisible to every other check because every individual cell looks
 * fine.
 */
import type { StageSpec, Feeling } from "./types.js";

export interface JourneyCheck {
  stages: StageSpec[];
  warnings: string[];
}

const FEELINGS: Feeling[] = [-2, -1, 0, 1, 2];

export function checkJourney(input: StageSpec[]): JourneyCheck {
  const warnings: string[] = [];
  const stages: StageSpec[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    const id = String(raw?.id ?? "").trim();
    if (!id) {
      warnings.push("A stage has no id and was dropped — every stage needs one so a finding can name it.");
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`Two stages share the id "${id}"; the second was dropped.`);
      continue;
    }
    seen.add(id);

    let feeling = raw.feeling;
    if (feeling !== undefined && !FEELINGS.includes(feeling)) {
      const clamped = Math.max(-2, Math.min(2, Math.round(Number(feeling)))) as Feeling;
      if (Number.isFinite(Number(feeling))) {
        warnings.push(
          `Stage "${id}" has feeling ${String(raw.feeling)}; the scale is -2..2 in whole steps, so it was read as ${clamped}.`,
        );
        feeling = clamped;
      } else {
        warnings.push(`Stage "${id}" has a non-numeric feeling (${String(raw.feeling)}); treated as 0.`);
        feeling = 0;
      }
    }
    stages.push({ ...raw, id, ...(feeling !== undefined ? { feeling } : {}) });
  }

  if (stages.length === 0) return { stages, warnings };

  // --- one stage is not a journey -------------------------------------
  if (stages.length === 1) {
    warnings.push(
      "A journey with one stage is a screenshot. A journey map earns its keep by showing how the experience CHANGES across phases.",
    );
  }

  // --- a gap nobody is serving -----------------------------------------
  //
  // The headline finding of the whole artefact. Exempt: a stage that is
  // explicitly about the person being alone with the problem ("Nhận ra vấn
  // đề") is legitimately untouched, and the author signals that by leaving
  // `doing` filled and `touchpoints` empty on purpose — which is exactly
  // this case, so the wording asks rather than accuses.
  const unserved = stages.filter((s) => (s.touchpoints?.length ?? 0) === 0);
  if (unserved.length > 0 && unserved.length < stages.length) {
    warnings.push(
      `${unserved.length} stage(s) have no touchpoint: ${unserved.map((s) => s.id).join(", ")}. Either the person is on their own there — worth stating deliberately — or the product has a gap at the point they need it.`,
    );
  } else if (unserved.length === stages.length) {
    warnings.push(
      "No stage has a touchpoint. Without them this is a story about the person, not a map of where the product meets them.",
    );
  }

  // --- a journey that only complains ------------------------------------
  const pains = stages.reduce((a, s) => a + (s.pains?.length ?? 0), 0);
  const opps = stages.reduce((a, s) => a + (s.opportunities?.length ?? 0), 0);
  if (pains > 0 && opps === 0) {
    warnings.push(
      `${pains} pain point(s) and no opportunities. A journey map with no answers is a complaint; the opportunity column is what a team can act on.`,
    );
  }

  // --- the table that was filled in, not researched ---------------------
  //
  // Only when there are enough stages for flatness to be a claim. Three
  // stages at the same feeling is plausible; six is not.
  const felt = stages.filter((s) => s.feeling !== undefined);
  if (felt.length >= 4) {
    const values = new Set(felt.map((s) => s.feeling));
    if (values.size === 1) {
      warnings.push(
        `Every stage has feeling ${String(felt[0]!.feeling)}. A flat emotion track across ${felt.length} stages usually means the column was filled in rather than researched — and a flat journey cannot tell anyone where to start.`,
      );
    }
  }
  if (felt.length >= 3 && felt.every((s) => (s.feeling ?? 0) >= 0)) {
    warnings.push(
      "No stage feels negative. A journey with no low point is the demo path, not the experience — the low point is what the map is for.",
    );
  }

  // --- pain with no feeling, feeling with no pain -----------------------
  //
  // Not a style nit: these two columns are the artefact's internal
  // consistency, and a mismatch means one of them is guessed.
  for (const s of stages) {
    const hasPain = (s.pains?.length ?? 0) > 0;
    if (hasPain && (s.feeling ?? 0) > 0) {
      warnings.push(
        `Stage "${s.id}" lists a pain point but feels positive (${s.feeling}). One of the two columns is guessed.`,
      );
    }
    if (!hasPain && (s.feeling ?? 0) <= -2) {
      warnings.push(
        `Stage "${s.id}" is the low point of the journey but names no pain. What happens there?`,
      );
    }
  }

  return { stages, warnings };
}
