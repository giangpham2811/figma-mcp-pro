/// <reference types="@figma/plugin-typings" />
/**
 * Component authoring — the half of a design system the free edition can read
 * but not write.
 *
 * One rule runs through every handler here: a component is not a node, it is a
 * contract every instance in the file has already signed. A `create()` that
 * goes wrong makes one ugly frame. A `create_variants()` that goes wrong
 * re-links every instance of the components it swallowed, and there is no undo
 * on the agent's side of the wire. So each op below reads the live state,
 * refuses on an ambiguity instead of guessing, and reports what it actually
 * did rather than what it was asked to do.
 */
import { HandlerContext, requireNode, findNode } from "../context.js";
import { err } from "../errors.js";
import { ErrorCode } from "../../shared/protocol.js";
import { serializeNode } from "../serialize.js";
import { resolveParent, insertInto } from "../insert.js";
import { InsertAt } from "../layout-math.js";
import { keepClearOnCanvas } from "../keep-clear.js";
import { rankCandidates, type Candidate } from "../fuzzy.js";
import { createTree } from "./create.js";
import {
  planPropertyPatch,
  propertyValueStuck,
  type ComponentPropertyEntry,
} from "../edit-util.js";

type ComponentLike = ComponentNode | ComponentSetNode;

/** A component as the finder reports it. */
export interface ComponentHit extends Candidate {
  type: "COMPONENT" | "COMPONENT_SET";
  key: string;
  pageName: string;
  /** Present for a COMPONENT that belongs to a set — instantiate the set. */
  componentSetId?: string;
  variantProperties?: Record<string, string> | null;
}

/**
 * Every local component in the document.
 *
 * `findAllWithCriteria` is the fast path Figma provides; the manual walk is
 * the fallback for runtimes (and test mocks) without it. Components that live
 * inside a set are skipped at the top level and reached through their set,
 * because a set with nine variants would otherwise bury every other component
 * in the ranking.
 */
async function allComponents(): Promise<ComponentLike[]> {
  await figma.loadAllPagesAsync?.();
  const root = figma.root;
  const found =
    typeof root.findAllWithCriteria === "function"
      ? (root.findAllWithCriteria({
          types: ["COMPONENT", "COMPONENT_SET"],
        }) as ComponentLike[])
      : (root.findAll(
          (n) => n.type === "COMPONENT" || n.type === "COMPONENT_SET",
        ) as ComponentLike[]);
  return found.filter(
    (n) => !(n.type === "COMPONENT" && n.parent?.type === "COMPONENT_SET"),
  );
}

function pageOf(node: BaseNode): string {
  let cur: BaseNode | null = node;
  while (cur && cur.type !== "PAGE") cur = cur.parent;
  return cur ? (cur as PageNode).name : "";
}

export function toHit(node: ComponentLike): ComponentHit {
  const hit: ComponentHit = {
    id: node.id,
    name: node.name,
    type: node.type,
    key: node.key,
    pageName: pageOf(node),
  };
  if (node.type === "COMPONENT") {
    const c = node as ComponentNode;
    if (c.parent?.type === "COMPONENT_SET") hit.componentSetId = c.parent.id;
    if (c.variantProperties) hit.variantProperties = c.variantProperties;
  }
  return hit;
}

/**
 * find_component — rank the file's components against a name.
 *
 * Returns candidates, never "the" component, even when one scores 1000. The
 * caller is usually about to create a near-duplicate, and the useful answer to
 * "do we have a Button?" is the list — including the "Button / Primary" a
 * single best-match would have hidden.
 */
export async function findComponent(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const query = String(p.query ?? p.name ?? "").trim();
  const limit =
    typeof p.limit === "number" ? Math.max(1, Math.min(50, p.limit)) : 10;
  const components = await allComponents();
  const ranked = rankCandidates(query, components.map(toHit), limit);

  if (ranked.length === 0) {
    return {
      query,
      matches: [],
      totalComponents: components.length,
      hint:
        components.length === 0
          ? "This file has no local components yet. componentize(nodeId) turns a frame into one."
          : `No component name resembles "${query}". get_components lists them all.`,
    };
  }
  return {
    query,
    matches: ranked.map((r) => ({
      ...r.candidate,
      score: r.score,
      match: r.reason,
    })),
    totalComponents: components.length,
    // An exact hit still comes back inside the list; this flag is what lets a
    // caller skip the disambiguation round-trip without the handler deciding
    // on its behalf.
    exact: ranked[0]!.reason === "exact",
  };
}

/**
 * find_or_create_component — the anti-duplication door.
 *
 * With no `spec` it is find_component with a verdict. With a `spec`, a miss
 * builds the component and a hit returns the existing one UNTOUCHED: an agent
 * that asks twice in one session must not get two Buttons, and must not get
 * its second spec quietly applied over the first one's work either.
 */
export async function findOrCreateComponent(
  ctx: HandlerContext,
): Promise<unknown> {
  const p = ctx.params;
  const query = String(p.query ?? p.name ?? "").trim();
  const components = await allComponents();
  const ranked = rankCandidates(query, components.map(toHit), 5);
  const best = ranked[0];

  // Only an exact name match counts as "already exists". A 600-point
  // "contains" hit on "Button Group" must not answer a request for "Button".
  if (best && best.reason === "exact") {
    return {
      created: false,
      component: best.candidate,
      alternatives: ranked.slice(1).map((r) => r.candidate),
    };
  }

  if (!p.spec || typeof p.spec !== "object") {
    return {
      created: false,
      component: null,
      notFound: true,
      alternatives: ranked.map((r) => ({ ...r.candidate, score: r.score })),
      hint: `No component named exactly "${query}". Pass spec to create one, or use one of the alternatives.`,
    };
  }

  const spec = { ...(p.spec as Record<string, unknown>) };
  if (spec.name === undefined) spec.name = query;
  const parent =
    p.parentId !== undefined
      ? await resolveParent(p.parentId)
      : figma.currentPage;
  // createTree reads its spec off ctx.params, so the child spec rides in on a
  // derived context rather than a second parameter — same pipeline (tokens,
  // text styles, effects, keep-clear placement) as an ordinary create().
  const node = await createTree({ ...ctx, params: spec }, parent);
  const component = figma.createComponentFromNode(node as SceneNode);
  component.name = query;
  if (typeof p.description === "string") component.description = p.description;

  if (ranked.length > 0) {
    ctx.warn(
      `Created "${query}" while ${ranked.length} similarly named component(s) exist (${ranked
        .map((r) => r.candidate.name)
        .join(", ")}). Check this is not a duplicate.`,
    );
  }
  return {
    created: true,
    component: toHit(component),
    node: serializeNode(component, "compact"),
  };
}

/** componentize — turn an existing frame/group into a main component. */
export async function componentize(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const node = await requireNode(p.nodeId ?? p.id);
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    return {
      id: node.id,
      alreadyComponent: true,
      component: toHit(node as ComponentLike),
    };
  }
  if (node.type === "INSTANCE") {
    throw err(
      ErrorCode.INVALID_PARAMS,
      "Cannot componentize an instance — it already has a main component.",
      "detach_instance(nodeId) first if you want an independent copy, then componentize that.",
    );
  }
  const component = figma.createComponentFromNode(node as SceneNode);
  if (typeof p.name === "string" && p.name.trim())
    component.name = p.name.trim();
  if (typeof p.description === "string") component.description = p.description;
  return {
    id: component.id,
    component: toHit(component),
    node: serializeNode(component, "compact"),
  };
}

/**
 * Resolve the thing to instantiate: a component, a set (→ its default
 * variant), or a published key.
 */
async function resolveInstantiable(
  p: Record<string, unknown>,
): Promise<{ component: ComponentNode; set: ComponentSetNode | null }> {
  const id = p.componentId ?? p.nodeId ?? p.id;
  let node: BaseNode | null = null;

  if (typeof id === "string" && id.length > 0) {
    node = await findNode(id);
  }
  if (!node && typeof p.key === "string" && p.key.length > 0) {
    const key = p.key;
    await figma.loadAllPagesAsync?.();
    node =
      figma.root.findOne(
        (n) =>
          (n.type === "COMPONENT" || n.type === "COMPONENT_SET") &&
          (n as ComponentLike).key === key,
      ) ?? null;
    if (!node) {
      // Not local — try the published-library path before giving up.
      try {
        node = await figma.importComponentByKeyAsync(key);
      } catch {
        try {
          node = await figma.importComponentSetByKeyAsync(key);
        } catch {
          node = null;
        }
      }
    }
  }

  if (!node) {
    throw err(
      ErrorCode.NODE_NOT_FOUND,
      "No component to instantiate.",
      "Pass componentId from find_component/get_components, or key for a published library component.",
    );
  }
  if (node.type === "COMPONENT_SET") {
    const set = node as ComponentSetNode;
    const def = set.defaultVariant;
    if (!def) {
      throw err(
        ErrorCode.INVALID_PARAMS,
        `Component set "${set.name}" has no variants to instantiate.`,
        "Add a variant to the set, or pass the id of a specific COMPONENT.",
      );
    }
    return { component: def, set };
  }
  if (node.type !== "COMPONENT") {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `Node ${node.id} is a ${node.type}, not a component.`,
      "componentize(nodeId) turns a frame into a component first.",
    );
  }
  const c = node as ComponentNode;
  return {
    component: c,
    set:
      c.parent?.type === "COMPONENT_SET"
        ? (c.parent as ComponentSetNode)
        : null,
  };
}

export interface PropertyOutcome {
  applied: string[];
  failed: Array<{ name: string; error: string; candidates?: string[] }>;
}

/**
 * Apply a {name: value} patch to an instance.
 *
 * Two passes, and the order is load-bearing: setting a VARIANT re-reads the
 * instance off a DIFFERENT main component, which discards anything set in the
 * same call. Variants first, re-resolve against the new property map, then the
 * rest. `planPropertyPatch` already splits them; this function is why it does.
 */
export async function applyProperties(
  instance: InstanceNode,
  input: Record<string, unknown>,
  ctx: HandlerContext,
): Promise<PropertyOutcome> {
  const applied: string[] = [];
  const failed: Array<{ name: string; error: string; candidates?: string[] }> =
    [];

  const available = instance.componentProperties as unknown as Record<
    string,
    ComponentPropertyEntry
  >;
  const plan = planPropertyPatch(available ?? {}, input);
  failed.push(...plan.failed);

  if (plan.variants.length > 0) {
    const patch: Record<string, string | boolean> = {};
    for (const v of plan.variants) patch[v.key] = v.value as string | boolean;
    try {
      instance.setProperties(patch);
      // Read back here too, and for the same reason as below — MORE so: a
      // variant combination that does not exist is the single most common way
      // a write is swallowed, and this is the branch that takes it.
      const readBack = instance.componentProperties as unknown as Record<
        string,
        ComponentPropertyEntry
      >;
      for (const v of plan.variants) {
        if (propertyValueStuck(v.value, readBack?.[v.key]?.value)) {
          applied.push(v.name);
        } else {
          failed.push({
            name: v.name,
            error: `Figma accepted "${String(v.value)}" but the instance still reads "${String(
              readBack?.[v.key]?.value,
            )}" — usually a variant value that does not exist on this set.`,
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const v of plan.variants) failed.push({ name: v.name, error: msg });
    }
  }

  if (plan.rest.length > 0) {
    // Re-plan: after a variant switch the keys carry different "#id" suffixes,
    // so keys resolved before the switch may no longer exist.
    const after = instance.componentProperties as unknown as Record<
      string,
      ComponentPropertyEntry
    >;
    const names: Record<string, unknown> = {};
    for (const r of plan.rest) names[r.name] = input[r.name];
    const plan2 = planPropertyPatch(after ?? {}, names);
    failed.push(...plan2.failed);

    const todo = [...plan2.variants, ...plan2.rest];
    if (todo.length > 0) {
      const patch: Record<string, string | boolean> = {};
      for (const r of todo) patch[r.key] = r.value as string | boolean;
      try {
        instance.setProperties(patch);
        // Verify rather than assume: Figma accepts a value for a variant
        // combination that does not exist and silently keeps the old one,
        // which reads as the agent's bug until somebody reads back.
        const readBack = instance.componentProperties as unknown as Record<
          string,
          ComponentPropertyEntry
        >;
        for (const r of todo) {
          if (propertyValueStuck(r.value, readBack?.[r.key]?.value)) {
            applied.push(r.name);
          } else {
            failed.push({
              name: r.name,
              error: `Figma accepted "${String(r.value)}" but the instance still reads "${String(
                readBack?.[r.key]?.value,
              )}" — usually a variant combination that does not exist.`,
            });
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const r of todo) failed.push({ name: r.name, error: msg });
      }
    }
  }

  for (const f of failed) ctx.warn(`property "${f.name}": ${f.error}`);
  return { applied, failed };
}

export interface OverrideOutcome {
  layer: string;
  ok: boolean;
  note?: string;
}

/**
 * Apply layer-level overrides by layer name.
 *
 * ponytail: text and visibility only — they are almost everything an agent
 * overrides on an instance, and every other field already has a safer door
 * (set_selection_colors, modify on the resolved child id). Widen it when a
 * real case needs more, not before.
 */
export async function applyOverrides(
  instance: InstanceNode,
  overrides: Record<string, unknown>,
  ctx: HandlerContext,
): Promise<OverrideOutcome[]> {
  const results: OverrideOutcome[] = [];
  const descendants = instance.findAll(() => true);

  for (const [layerName, raw] of Object.entries(overrides)) {
    const matches = descendants.filter((n) => n.name === layerName);
    if (matches.length === 0) {
      results.push({
        layer: layerName,
        ok: false,
        note: "no layer with that name inside the instance",
      });
      ctx.warn(`override "${layerName}": no such layer in the instance.`);
      continue;
    }
    if (matches.length > 1) {
      results.push({
        layer: layerName,
        ok: false,
        note: `${matches.length} layers share this name — rename them in the main component, or modify() the child id directly`,
      });
      ctx.warn(`override "${layerName}": ambiguous (${matches.length} layers).`);
      continue;
    }
    const target = matches[0]!;
    const spec =
      typeof raw === "string"
        ? { characters: raw }
        : (raw as Record<string, unknown>);
    try {
      if (typeof spec.visible === "boolean") target.visible = spec.visible;
      const text = spec.characters ?? spec.text;
      if (typeof text === "string") {
        if (target.type !== "TEXT") {
          results.push({
            layer: layerName,
            ok: false,
            note: `layer is a ${target.type}, not TEXT`,
          });
          continue;
        }
        const t = target as TextNode;
        await figma.loadFontAsync(t.fontName as FontName);
        t.characters = text;
      }
      results.push({ layer: layerName, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ layer: layerName, ok: false, note: msg });
      ctx.warn(`override "${layerName}": ${msg}`);
    }
  }
  return results;
}

/** instantiate — create one or more instances, with props and overrides applied. */
export async function instantiate(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const { component, set } = await resolveInstantiable(p);
  const count =
    typeof p.count === "number"
      ? Math.max(1, Math.min(200, Math.floor(p.count)))
      : 1;
  const parent =
    p.parentId !== undefined
      ? await resolveParent(p.parentId)
      : figma.currentPage;

  const made: Array<Record<string, unknown>> = [];
  for (let i = 0; i < count; i++) {
    const instance = component.createInstance();
    insertInto(parent, instance, p.insertAt as InsertAt | undefined);
    if (typeof p.name === "string") instance.name = p.name;
    if (typeof p.x === "number") instance.x = p.x;
    if (typeof p.y === "number") instance.y = p.y;
    keepClearOnCanvas(instance, p, ctx);

    const entry: Record<string, unknown> = { id: instance.id };
    if (p.props && typeof p.props === "object") {
      entry.properties = await applyProperties(
        instance,
        p.props as Record<string, unknown>,
        ctx,
      );
    }
    if (p.overrides && typeof p.overrides === "object") {
      entry.overrides = await applyOverrides(
        instance,
        p.overrides as Record<string, unknown>,
        ctx,
      );
    }
    if (count === 1) entry.node = serializeNode(instance, "compact");
    made.push(entry);
    if (count > 1 && (i + 1) % 10 === 0)
      ctx.progress(i + 1, count, "instantiating");
  }

  return {
    mainComponentId: component.id,
    componentSetId: set?.id ?? null,
    // The available keys travel back with the result so a caller that guessed
    // a property name wrong can fix it without a second read.
    availableProperties: Object.keys(component.componentPropertyDefinitions ?? {}),
    count: made.length,
    instances: made,
    ids: made.map((m) => m.id),
  };
}

/**
 * create_variants — combine components into one set.
 *
 * `combineAsVariants` is destructive in a way that is easy to miss: the
 * components are MOVED into the set and every existing instance re-links. So
 * the pre-flight below refuses the whole call rather than combining whichever
 * subset happens to be legal.
 */
export async function createVariants(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const ids = (p.nodeIds as string[]) ?? [];
  const nodes: ComponentNode[] = [];
  const problems: string[] = [];

  for (const id of ids) {
    const node = await findNode(id);
    if (!node) {
      problems.push(`${id}: no such node`);
      continue;
    }
    if (node.type !== "COMPONENT") {
      problems.push(`${id} ("${node.name}"): is a ${node.type}, not a COMPONENT`);
      continue;
    }
    if (node.parent?.type === "COMPONENT_SET") {
      problems.push(
        `${id} ("${node.name}"): already a variant of set "${node.parent.name}"`,
      );
      continue;
    }
    nodes.push(node as ComponentNode);
  }

  if (problems.length > 0) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `create_variants cannot combine these nodes: ${problems.join("; ")}.`,
      "Every node must be a standalone COMPONENT. componentize(nodeId) converts a frame; a component already in a set must be removed from it first.",
    );
  }
  if (nodes.length < 2) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      "create_variants needs at least two components.",
      "A single component does not need a set; rename it instead.",
    );
  }

  // Figma derives variant properties from "Prop=Value, Prop2=Value2" names. A
  // component named without one contributes no axis, and the set silently
  // gets a property called "Property 1" — worth saying out loud, once.
  const unnamed = nodes.filter((n) => !n.name.includes("="));
  if (unnamed.length > 0) {
    ctx.warn(
      `${unnamed.length} component(s) have no "Property=Value" name (${unnamed
        .map((n) => n.name)
        .join(
          ", ",
        )}); Figma will invent a property name for them. Rename to e.g. "Size=Large" before combining for a meaningful set.`,
    );
  }

  const parent =
    p.parentId !== undefined
      ? await resolveParent(p.parentId)
      : ((nodes[0]!.parent ?? figma.currentPage) as BaseNode & ChildrenMixin);
  const set = figma.combineAsVariants(nodes, parent);
  if (typeof p.name === "string" && p.name.trim()) set.name = p.name.trim();
  if (typeof p.description === "string") set.description = p.description;

  // combineAsVariants is one of the two node builders that bypass createTree,
  // and it hands back a cornerRadius nobody chose. Left alone it reads as a
  // deliberate design decision in every screenshot of the file.
  // See ARCHITECTURE.md, "Audit the node builder that cannot use the shared one".
  set.cornerRadius = 0;

  return {
    id: set.id,
    name: set.name,
    variantCount: set.children.length,
    variantProperties: set.variantGroupProperties ?? null,
    componentPropertyDefinitions: Object.keys(
      set.componentPropertyDefinitions ?? {},
    ),
    node: serializeNode(set, "compact"),
  };
}

/** arrange_component_set — lay a set's variants out on a readable grid. */
export async function arrangeComponentSet(
  ctx: HandlerContext,
): Promise<unknown> {
  const p = ctx.params;
  const node = await requireNode(p.nodeId ?? p.id);
  if (node.type !== "COMPONENT_SET") {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `Node ${node.id} is a ${node.type}, not a COMPONENT_SET.`,
      "Pass the id of a component set (create_variants returns one).",
    );
  }
  const set = node as ComponentSetNode;
  const gap = typeof p.gap === "number" ? Math.max(0, p.gap) : 24;
  const kids = [...set.children] as ComponentNode[];
  if (kids.length === 0) return { id: set.id, arranged: 0 };

  const columns =
    typeof p.columns === "number" && p.columns >= 1
      ? Math.floor(p.columns)
      : Math.max(1, Math.ceil(Math.sqrt(kids.length)));

  // Uniform cells sized to the largest variant: a grid of ragged rows is
  // harder to read than a grid with some air in it.
  const cellW = Math.max(...kids.map((k) => k.width));
  const cellH = Math.max(...kids.map((k) => k.height));
  const pad = typeof p.padding === "number" ? Math.max(0, p.padding) : gap;

  kids.forEach((kid, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    kid.x = pad + col * (cellW + gap);
    kid.y = pad + row * (cellH + gap);
  });

  const rows = Math.ceil(kids.length / columns);
  set.resizeWithoutConstraints(
    pad * 2 + columns * cellW + (columns - 1) * gap,
    pad * 2 + rows * cellH + (rows - 1) * gap,
  );

  return {
    id: set.id,
    arranged: kids.length,
    columns,
    rows,
    cell: { w: cellW, h: cellH },
  };
}

/** set_component_description — the text shown in the Assets panel. */
export async function setComponentDescription(
  ctx: HandlerContext,
): Promise<unknown> {
  const p = ctx.params;
  const node = await requireNode(p.nodeId ?? p.id);
  if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `Node ${node.id} is a ${node.type}; only components carry a description.`,
      "For a set, describe the SET — its variants inherit it in the Assets panel.",
    );
  }
  const target = node as ComponentLike;
  // A variant's own description is invisible in the UI; the set owns it.
  if (target.type === "COMPONENT" && target.parent?.type === "COMPONENT_SET") {
    ctx.warn(
      `"${target.name}" is a variant; its description is not shown in the Assets panel. Set it on the parent set (${target.parent.id}) instead.`,
    );
  }
  target.description = String(p.description ?? "");
  return { id: target.id, description: target.description };
}

/**
 * The node that owns a property of a given type.
 *
 * VARIANT properties live on the SET and nowhere else; BOOLEAN / TEXT /
 * INSTANCE_SWAP live on a COMPONENT. Calling the wrong one throws a Figma
 * error that names neither fact, so the routing happens here.
 */
function propertyOwner(node: SceneNode, type: string): ComponentLike {
  const wantsVariant = type === "VARIANT";
  if (node.type === "COMPONENT_SET") {
    if (!wantsVariant) {
      const first = (node as ComponentSetNode).children[0];
      if (first && first.type === "COMPONENT") return first as ComponentNode;
    }
    return node as ComponentSetNode;
  }
  if (node.type === "COMPONENT") {
    const c = node as ComponentNode;
    if (wantsVariant) {
      if (c.parent?.type === "COMPONENT_SET")
        return c.parent as ComponentSetNode;
      throw err(
        ErrorCode.INVALID_PARAMS,
        `"${c.name}" is not part of a component set, so it cannot hold a VARIANT property.`,
        "create_variants(nodeIds) builds a set first; VARIANT properties then live on that set.",
      );
    }
    return c;
  }
  throw err(
    ErrorCode.INVALID_PARAMS,
    `Node ${node.id} is a ${node.type}, not a component.`,
    "Component properties are defined on a COMPONENT or COMPONENT_SET.",
  );
}

/** Default value Figma demands for each property type. */
function defaultFor(type: string, raw: unknown): string | boolean {
  if (type === "BOOLEAN") {
    if (typeof raw === "boolean") return raw;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return true;
  }
  if (raw === undefined || raw === null) return type === "TEXT" ? "Text" : "";
  return String(raw);
}

export async function addComponentProperty(
  ctx: HandlerContext,
): Promise<unknown> {
  const p = ctx.params;
  const node = await requireNode(p.nodeId ?? p.id);
  const type = String(p.type ?? "").toUpperCase();
  const owner = propertyOwner(node as SceneNode, type);
  const name = String(p.name).trim();

  const existing = Object.keys(owner.componentPropertyDefinitions ?? {});
  if (existing.some((k) => k === name || k.split("#")[0] === name)) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `"${owner.name}" already has a property named "${name}".`,
      `Use edit_component_property to change it. Existing: ${existing.join(", ")}.`,
    );
  }

  const options =
    type === "INSTANCE_SWAP" && Array.isArray(p.preferredValues)
      ? { preferredValues: p.preferredValues as InstanceSwapPreferredValue[] }
      : undefined;

  let key: string;
  try {
    key = owner.addComponentProperty(
      name,
      type as ComponentPropertyType,
      defaultFor(type, p.defaultValue),
      options,
    );
  } catch (e) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `Figma refused to add ${type} property "${name}" to "${owner.name}": ${
        e instanceof Error ? e.message : String(e)
      }`,
      type === "VARIANT"
        ? 'A VARIANT property needs every variant in the set to define a value for it; rename the variants to "Prop=Value" first.'
        : "Check the default value matches the type (BOOLEAN wants true/false, TEXT wants a string).",
    );
  }

  return {
    ownerId: owner.id,
    ownerType: owner.type,
    // The "#1:2"-suffixed key is what setProperties needs and what nobody can
    // guess, so it is the headline of this result, not a detail.
    key,
    name,
    type,
    definitions: Object.keys(owner.componentPropertyDefinitions ?? {}),
  };
}

/** Resolve a caller-written property name to its real "#"-suffixed key. */
function ownerKeyFor(owner: ComponentLike, name: string): string {
  const keys = Object.keys(owner.componentPropertyDefinitions ?? {});
  if (keys.includes(name)) return name;
  const base = keys.filter((k) => k.split("#")[0] === name);
  if (base.length === 1) return base[0]!;
  if (base.length > 1) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `"${name}" matches ${base.length} properties on "${owner.name}".`,
      `Pass the full key: ${base.join(", ")}.`,
    );
  }
  const ci = keys.filter(
    (k) => k.split("#")[0]!.toLowerCase() === name.trim().toLowerCase(),
  );
  if (ci.length === 1) return ci[0]!;
  throw err(
    ErrorCode.NODE_NOT_FOUND,
    `"${owner.name}" has no property named "${name}".`,
    keys.length > 0
      ? `It has: ${keys.join(", ")}.`
      : "It has no component properties yet.",
  );
}

/** The owner that actually declares `name`, searching set and variants. */
function findPropertyOwner(
  node: SceneNode,
  name: string,
): { owner: ComponentLike; key: string } {
  const tries: ComponentLike[] = [];
  if (node.type === "COMPONENT_SET") {
    tries.push(node as ComponentSetNode);
    const first = (node as ComponentSetNode).children[0];
    if (first?.type === "COMPONENT") tries.push(first as ComponentNode);
  } else if (node.type === "COMPONENT") {
    tries.push(node as ComponentNode);
    if (node.parent?.type === "COMPONENT_SET")
      tries.push(node.parent as ComponentSetNode);
  } else {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `Node ${node.id} is a ${node.type}, not a component.`,
      "Component properties live on a COMPONENT or COMPONENT_SET.",
    );
  }
  let last: unknown;
  for (const owner of tries) {
    try {
      return { owner, key: ownerKeyFor(owner, name) };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export async function editComponentProperty(
  ctx: HandlerContext,
): Promise<unknown> {
  const p = ctx.params;
  const node = await requireNode(p.nodeId ?? p.id);
  const { owner, key } = findPropertyOwner(node as SceneNode, String(p.name).trim());
  const def = (owner.componentPropertyDefinitions ?? {})[key];

  const patch: {
    name?: string;
    defaultValue?: string | boolean;
    preferredValues?: InstanceSwapPreferredValue[];
  } = {};
  if (typeof p.newName === "string" && p.newName.trim())
    patch.name = p.newName.trim();
  if (p.defaultValue !== undefined)
    patch.defaultValue = defaultFor(String(def?.type ?? ""), p.defaultValue);
  if (Array.isArray(p.preferredValues))
    patch.preferredValues = p.preferredValues as InstanceSwapPreferredValue[];

  let newKey: string;
  try {
    newKey = owner.editComponentProperty(key, patch);
  } catch (e) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `Figma refused to edit property "${key}" on "${owner.name}": ${
        e instanceof Error ? e.message : String(e)
      }`,
      "A VARIANT property can only be renamed, not given a new default; rename the variants to change values.",
    );
  }
  return {
    ownerId: owner.id,
    // Renaming MINTS A NEW KEY. A caller holding the old one is now holding a
    // dead string, and setProperties fails with "no such property" three calls
    // later — a horrible place to learn this.
    previousKey: key,
    key: newKey,
    definitions: Object.keys(owner.componentPropertyDefinitions ?? {}),
  };
}

export async function deleteComponentProperty(
  ctx: HandlerContext,
): Promise<unknown> {
  const p = ctx.params;
  const node = await requireNode(p.nodeId ?? p.id);
  const { owner, key } = findPropertyOwner(node as SceneNode, String(p.name).trim());
  try {
    owner.deleteComponentProperty(key);
  } catch (e) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `Figma refused to delete property "${key}" on "${owner.name}": ${
        e instanceof Error ? e.message : String(e)
      }`,
      "A VARIANT property cannot be deleted while variants still encode it in their names.",
    );
  }
  ctx.warn(
    `Deleted "${key}" — every instance of "${owner.name}" loses the value it had for it; this is not undoable from the agent side.`,
  );
  return {
    ownerId: owner.id,
    deleted: key,
    definitions: Object.keys(owner.componentPropertyDefinitions ?? {}),
  };
}
