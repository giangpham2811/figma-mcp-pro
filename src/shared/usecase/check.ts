/**
 * The use case proof-reader.
 *
 * It does one thing the other checkers in this repo do not: it DROPS a
 * relationship UML gives no meaning to, rather than drawing it with a
 * warning attached. The reason is that a drawn line is a claim. An
 * actor-to-actor association on a use case diagram says something specific
 * in UML (generalisation, if it has a hollow triangle) and says nothing at
 * all as a plain line — so drawing it means the diagram asserts a
 * relationship that does not exist. A warning next to a lying picture is
 * still a lying picture, and the picture is what gets screenshotted into
 * the spec.
 *
 * Everything else is reported and drawn, because the whole point of an
 * orphaned use case is to be visible on the wall.
 */
import type { ActorSpec, UseCaseSpec, ActorKind } from "./types.js";

export interface UseCaseCheck {
  actors: ActorSpec[];
  useCases: UseCaseSpec[];
  warnings: string[];
}

const KINDS: ActorKind[] = ["primary", "secondary", "system"];

export function checkUseCases(
  rawActors: ActorSpec[],
  rawUseCases: UseCaseSpec[],
): UseCaseCheck {
  const warnings: string[] = [];
  const actors: ActorSpec[] = [];
  const useCases: UseCaseSpec[] = [];
  const actorIds = new Set<string>();
  const ucIds = new Set<string>();

  for (const raw of rawActors) {
    const id = String(raw?.id ?? "").trim();
    if (!id) {
      warnings.push("An actor has no id and was dropped.");
      continue;
    }
    if (actorIds.has(id)) {
      warnings.push(`Two actors share the id "${id}"; the second was dropped.`);
      continue;
    }
    actorIds.add(id);
    const kind = raw.kind;
    if (kind !== undefined && !KINDS.includes(kind)) {
      warnings.push(`Actor "${id}" has kind "${String(kind)}"; expected ${KINDS.join("/")}. Treated as secondary.`);
    }
    actors.push({ ...raw, id, kind: kind && KINDS.includes(kind) ? kind : kind === undefined ? undefined : "secondary" });
  }

  for (const raw of rawUseCases) {
    const id = String(raw?.id ?? "").trim();
    if (!id) {
      warnings.push("A use case has no id and was dropped.");
      continue;
    }
    if (ucIds.has(id)) {
      warnings.push(`Two use cases share the id "${id}"; the second was dropped.`);
      continue;
    }
    ucIds.add(id);
    useCases.push({ ...raw, id });
  }

  // --- references that point nowhere ---------------------------------
  for (const uc of useCases) {
    const keptActors: string[] = [];
    for (const a of uc.actors ?? []) {
      if (actorIds.has(a)) {
        keptActors.push(a);
        continue;
      }
      // An unknown actor id on a use case would otherwise be drawn as a line
      // to nothing, or silently dropped. Say which one.
      if (ucIds.has(a)) {
        warnings.push(
          `Use case "${uc.id}" lists "${a}" as an actor, but "${a}" is another USE CASE. If one always performs the other, that is \`includes\`; if it sometimes adds to it, that is \`extends\`.`,
        );
      } else {
        warnings.push(`Use case "${uc.id}" lists actor "${a}", which does not exist.`);
      }
    }
    uc.actors = keptActors;

    const keptIncludes: string[] = [];
    for (const inc of uc.includes ?? []) {
      if (ucIds.has(inc)) keptIncludes.push(inc);
      else warnings.push(`Use case "${uc.id}" includes "${inc}", which does not exist.`);
    }
    uc.includes = keptIncludes;

    const keptExtends: string[] = [];
    for (const ext of uc.extends ?? []) {
      if (ucIds.has(ext)) keptExtends.push(ext);
      else warnings.push(`Use case "${uc.id}" extends "${ext}", which does not exist.`);
    }
    uc.extends = keptExtends;
  }

  // --- the link UML has no meaning for --------------------------------
  //
  // Dropped, not warned-and-drawn. See the header.
  for (const a of actors) {
    const stray = (a as { actors?: string[] }).actors;
    if (Array.isArray(stray) && stray.length) {
      warnings.push(
        `Actor "${a.id}" was given links to other actors. A plain line between two actors means nothing in UML, so it was NOT drawn — a diagram that shows one is asserting a relationship that does not exist. If one actor is a kind of the other, say so in \`detail\`.`,
      );
      delete (a as { actors?: string[] }).actors;
    }
  }

  // --- a use case nobody can start -------------------------------------
  //
  // The headline finding. Exempt: a use case reached only by `include` from
  // another one is legitimately actorless — it is factored-out common work,
  // and its actor is whoever started the including use case.
  const included = new Set<string>();
  for (const uc of useCases) for (const inc of uc.includes ?? []) included.add(inc);

  for (const uc of useCases) {
    if ((uc.actors?.length ?? 0) > 0) continue;
    if (included.has(uc.id)) continue;
    const extendsSomething = (uc.extends?.length ?? 0) > 0;
    warnings.push(
      extendsSomething
        ? `Use case "${uc.id}" has no actor. It extends another use case, so it inherits that one's trigger — but if a person can start it directly, say who.`
        : `Use case "${uc.id}" has no actor and nothing includes it, so nobody can start it. Either it is out of scope, or an actor is missing.`,
    );
  }

  // --- an actor who does nothing ----------------------------------------
  const busy = new Set<string>();
  for (const uc of useCases) for (const a of uc.actors ?? []) busy.add(a);
  for (const a of actors) {
    if (!busy.has(a.id)) {
      warnings.push(
        `Actor "${a.id}" takes part in no use case. Either they are out of scope, or the thing they do has not been written down yet.`,
      );
    }
  }

  // --- include cycles ----------------------------------------------------
  //
  // A always does B and B always does A is not a factoring, it is a loop
  // that cannot terminate — and it is easy to write across three files.
  const graph = new Map(useCases.map((u) => [u.id, u.includes ?? []]));
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const reported = new Set<string>();

  const visit = (id: string): void => {
    const st = state.get(id) ?? 0;
    if (st === 2) return;
    if (st === 1) {
      const at = stack.indexOf(id);
      const cycle = [...stack.slice(at), id].join(" → ");
      if (!reported.has(cycle)) {
        reported.add(cycle);
        warnings.push(`Include cycle: ${cycle}. Each of these always performs the next, so none of them can finish.`);
      }
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const next of graph.get(id) ?? []) visit(next);
    stack.pop();
    state.set(id, 2);
  };
  for (const uc of useCases) visit(uc.id);

  // --- a boundary with nothing in it -------------------------------------
  if (useCases.length === 0 && actors.length > 0) {
    warnings.push("Actors but no use cases: the diagram says who is around the system and nothing about what it does for them.");
  }

  return { actors, useCases, warnings };
}
