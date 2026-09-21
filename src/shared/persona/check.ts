/**
 * The persona proof-reader.
 *
 * The bar every checker in this repo is held to: it must be SILENT when the
 * model is right, or it gets muted and stops being read. So each rule below
 * carries the exemption that makes its silence deliberate, and none of them
 * fire on a persona that is simply brief.
 *
 * What it reports is the model, never the drawing: two personas that are
 * really one person, a persona nobody could design for, a set with no
 * primary. Those are findings about the research. Card widths are not.
 */
import type { PersonaSpec, PersonaRole } from "./types.js";

export interface PersonaCheck {
  personas: PersonaSpec[];
  warnings: string[];
}

const ROLES: PersonaRole[] = ["primary", "secondary", "served", "negative"];

/** Lower-cased, punctuation-free words — for comparing two goal lists. */
function bag(items: string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const item of items ?? []) {
    for (const w of item.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      // Two-letter words are "to", "of", "và" — they make everything look
      // similar and would turn the duplicate rule into a wolf-crier.
      if (w.length > 2) out.add(w);
    }
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

export function checkPersonas(input: PersonaSpec[]): PersonaCheck {
  const warnings: string[] = [];
  const personas: PersonaSpec[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    const id = String(raw?.id ?? "").trim();
    if (!id) {
      warnings.push("A persona has no id and was dropped — every persona needs one, so a journey or a use case can reference it.");
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`Two personas share the id "${id}"; the second was dropped.`);
      continue;
    }
    seen.add(id);

    const role = raw.role;
    if (role !== undefined && !ROLES.includes(role)) {
      warnings.push(`Persona "${id}" has role "${String(role)}", which is not one of ${ROLES.join(", ")}; treated as secondary.`);
    }
    personas.push({
      ...raw,
      id,
      role: role && ROLES.includes(role) ? role : role === undefined ? undefined : "secondary",
    });
  }

  if (personas.length === 0) return { personas, warnings };

  // --- a persona nobody can design for -------------------------------
  //
  // Goals and frustrations are what a persona is FOR: they are the two
  // fields a prioritisation argument is settled with. A card without them is
  // a portrait.
  for (const p of personas) {
    const goals = p.goals?.length ?? 0;
    const frustrations = p.frustrations?.length ?? 0;
    if (goals === 0 && frustrations === 0) {
      warnings.push(
        `Persona "${p.id}" has no goals and no frustrations, so it cannot settle any argument about what to build. Add what they are trying to get done, and what stops them today.`,
      );
    } else if (goals === 0) {
      warnings.push(`Persona "${p.id}" lists frustrations but no goals — you know what annoys them, not what they came to do.`);
    } else if (frustrations === 0) {
      warnings.push(`Persona "${p.id}" lists goals but no frustrations. A persona with no obstacles gives the design nothing to remove.`);
    }
  }

  // --- the demographic persona ---------------------------------------
  //
  // Cooper's complaint, made checkable: a card built from age and location
  // with no observed behaviour is a marketing segment wearing a face.
  for (const p of personas) {
    const demo = Object.keys(p.demographics ?? {}).length;
    const behaviours = p.behaviours?.length ?? 0;
    if (demo >= 2 && behaviours === 0) {
      warnings.push(
        `Persona "${p.id}" carries ${demo} demographic fields and no observed behaviour. Age and location do not predict how somebody uses software; what they do today does.`,
      );
    }
  }

  // --- two personas that are one person -------------------------------
  //
  // The most expensive persona mistake, and the least visible: a set split
  // by job title or age bracket when the people behave identically. The
  // product then gets two backlogs for one need.
  //
  // 0.7 of the SMALLER goal vocabulary, and only when both have three or
  // more goals — below that, two short lists overlap by accident.
  for (let i = 0; i < personas.length; i++) {
    for (let j = i + 1; j < personas.length; j++) {
      const a = personas[i]!;
      const b = personas[j]!;
      if ((a.goals?.length ?? 0) < 3 || (b.goals?.length ?? 0) < 3) continue;
      const ratio = overlap(bag(a.goals), bag(b.goals));
      if (ratio >= 0.7) {
        warnings.push(
          `Personas "${a.id}" and "${b.id}" want ${Math.round(ratio * 100)}% the same things. If they behave the same, they are one persona with two job titles — splitting them gives the product two backlogs for one need.`,
        );
      }
    }
  }

  // --- who is this actually for? --------------------------------------
  const primaries = personas.filter((p) => p.role === "primary");
  if (primaries.length === 0) {
    // Only worth saying once the set is big enough for the question to bite.
    if (personas.length >= 2) {
      warnings.push(
        `None of the ${personas.length} personas is marked role:"primary". Without one, every trade-off is decided by whoever is in the room.`,
      );
    }
  } else if (primaries.length > 1) {
    warnings.push(
      `${primaries.length} personas are marked primary (${primaries.map((p) => p.id).join(", ")}). Designing for two primaries produces a product that fits neither — that is what the role is for.`,
    );
  }

  // --- too many to hold in one head -----------------------------------
  //
  // Not a style rule: past about five, nobody recalls them in a planning
  // meeting and the set stops being used at all.
  if (personas.length > 5) {
    warnings.push(
      `${personas.length} personas. Past five, nobody recalls them in a planning meeting and the set quietly stops being used. Merge the ones that behave alike, or mark the marginal ones role:"served".`,
    );
  }

  return { personas, warnings };
}
