/// <reference types="@figma/plugin-typings" />
/**
 * Instances: reading what a designer changed, and putting the same changes on
 * other instances.
 *
 * The honest framing first, because the Plugin API does not give what the
 * feature name suggests. `instance.overrides` reports WHICH nodes were
 * overridden and WHICH fields on them — it does not hand back the values, and
 * there is no `applyOverrides(other)`. So copying overrides between instances
 * is two different mechanisms wearing one name:
 *
 *   - component properties  — real API (`setProperties`), exact, reliable.
 *   - layer-level edits     — read the values off the source's layers and
 *                             write them onto the target's layers matched BY
 *                             NAME, which works because both sides descend
 *                             from the same main component.
 *
 * Every result below says which of the two carried each change, and names
 * what it could not carry. A tool that silently transferred half the diff and
 * reported success would be worse than one that refused.
 */
import { HandlerContext, requireNode, findNode } from "../context.js";
import { err } from "../errors.js";
import { ErrorCode } from "../../shared/protocol.js";
import { serializeNode } from "../serialize.js";
import {
  buildOverrideSummary,
  flattenComponentProperties,
  type OverrideSummary,
} from "../edit-util.js";
import { applyProperties } from "./components.js";

/** The layer-level half of a diff: values read off the source's own layers. */
export interface LayerOverride {
  /** Layer name, which is how it is matched on the target. */
  layer: string;
  characters?: string;
  visible?: boolean;
  /** Fields Figma reported as overridden that this tool does not carry. */
  uncarried?: string[];
}

/** The whole portable diff. `summary` keeps the free edition's shape. */
export interface InstanceDiff extends OverrideSummary {
  layerOverrides: LayerOverride[];
  /** Nodes Figma flagged as overridden whose fields are all uncarried. */
  unreadableNodes: number;
}

/** Fields this tool knows how to read and re-apply. */
const CARRIED = new Set(["characters", "visible"]);

async function requireInstance(id: unknown): Promise<InstanceNode> {
  const node = await requireNode(id);
  if (node.type !== "INSTANCE") {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `Node ${node.id} is a ${node.type}, not an INSTANCE.`,
      "Instance ops need the id of a placed instance. get_selection reports the type of what is selected.",
    );
  }
  return node as InstanceNode;
}

/** Read the portable diff off one instance. */
async function readDiff(instance: InstanceNode): Promise<InstanceDiff> {
  const main = await instance.getMainComponentAsync();
  const overrides = instance.overrides ?? [];
  const layerOverrides: LayerOverride[] = [];
  let unreadableNodes = 0;

  for (const entry of overrides) {
    // The overridden node id is absolute, so it resolves like any other.
    const node = (await findNode(entry.id)) as SceneNode | null;
    if (!node) {
      unreadableNodes++;
      continue;
    }
    const fields = (entry.overriddenFields ?? []) as string[];
    const rec: LayerOverride = { layer: node.name };
    let carried = false;
    if (fields.includes("characters") && node.type === "TEXT") {
      rec.characters = (node as TextNode).characters;
      carried = true;
    }
    if (fields.includes("visible")) {
      rec.visible = node.visible;
      carried = true;
    }
    const uncarried = fields.filter((f) => !CARRIED.has(f));
    if (uncarried.length > 0) rec.uncarried = uncarried;
    if (carried) layerOverrides.push(rec);
    else if (uncarried.length > 0) {
      unreadableNodes++;
      layerOverrides.push(rec);
    }
  }

  const summary = buildOverrideSummary({
    sourceInstanceId: instance.id,
    mainComponentId: main?.id ?? null,
    overriddenNodeIds: overrides.map((o) => o.id),
    componentProperties: flattenComponentProperties(
      instance.componentProperties as unknown as Record<
        string,
        { type?: string; value?: unknown }
      >,
    ),
    exposedInstanceIds: (instance.exposedInstances ?? []).map((i) => i.id),
  });

  return { ...summary, layerOverrides, unreadableNodes };
}

/** get_instance_overrides — the diff, in the shape set_instance_overrides eats. */
export async function getInstanceOverrides(
  ctx: HandlerContext,
): Promise<unknown> {
  const instance = await requireInstance(ctx.params.nodeId ?? ctx.params.id);
  const diff = await readDiff(instance);
  const main = await instance.getMainComponentAsync();

  if (diff.unreadableNodes > 0) {
    ctx.warn(
      `${diff.unreadableNodes} overridden layer(s) carry fields this tool cannot copy (fills, effects, size, …). Those layers are listed with an "uncarried" field; set them on the target with modify() if they matter.`,
    );
  }
  return {
    ...diff,
    mainComponentName: main?.name ?? null,
    // Round-trip hint on the read side, so the caller does not have to know
    // the second op's parameter name to use the first op's output.
    hint: "Pass this object as `source` to set_instance_overrides, with nodeIds of the instances to update.",
  };
}

/**
 * Write layer-level values onto a target by matching layer NAMES.
 *
 * Names, not ids: the ids inside two instances of the same component differ,
 * and Figma exposes no mapping between them. A duplicated name is reported
 * rather than guessed at — picking "the first Label" is exactly how an agent
 * silently edits the wrong row of a list.
 */
async function writeLayerOverrides(
  target: InstanceNode,
  layers: LayerOverride[],
  ctx: HandlerContext,
): Promise<Array<{ layer: string; ok: boolean; note?: string }>> {
  const out: Array<{ layer: string; ok: boolean; note?: string }> = [];
  if (layers.length === 0) return out;
  const descendants = target.findAll(() => true);

  for (const spec of layers) {
    if (spec.characters === undefined && spec.visible === undefined) {
      out.push({
        layer: spec.layer,
        ok: false,
        note: `only uncarried fields (${(spec.uncarried ?? []).join(", ")})`,
      });
      continue;
    }
    const matches = descendants.filter((n) => n.name === spec.layer);
    if (matches.length === 0) {
      out.push({ layer: spec.layer, ok: false, note: "no layer with that name" });
      continue;
    }
    if (matches.length > 1) {
      out.push({
        layer: spec.layer,
        ok: false,
        note: `${matches.length} layers share this name — rename them in the main component`,
      });
      continue;
    }
    const node = matches[0]!;
    try {
      if (spec.visible !== undefined) node.visible = spec.visible;
      if (spec.characters !== undefined) {
        if (node.type !== "TEXT") {
          out.push({
            layer: spec.layer,
            ok: false,
            note: `target layer is a ${node.type}, not TEXT`,
          });
          continue;
        }
        const t = node as TextNode;
        await figma.loadFontAsync(t.fontName as FontName);
        t.characters = spec.characters;
      }
      out.push({ layer: spec.layer, ok: true });
    } catch (e) {
      out.push({
        layer: spec.layer,
        ok: false,
        note: e instanceof Error ? e.message : String(e),
      });
    }
  }
  for (const r of out) {
    if (!r.ok) ctx.warn(`layer "${r.layer}": ${r.note}`);
  }
  return out;
}

/**
 * set_instance_overrides — put one instance's diff onto one or many others.
 *
 * Targets on a different main component are SKIPPED, not attempted. Their
 * property keys belong to a different contract, and half-applying a diff
 * across two components produces a file nobody can reason about later.
 */
export async function setInstanceOverrides(
  ctx: HandlerContext,
): Promise<unknown> {
  const p = ctx.params;

  let source: InstanceDiff;
  if (p.sourceInstanceId) {
    source = await readDiff(await requireInstance(p.sourceInstanceId));
  } else {
    const raw = p.source as Partial<InstanceDiff>;
    source = {
      sourceInstanceId: String(raw.sourceInstanceId ?? ""),
      mainComponentId: raw.mainComponentId ?? null,
      overriddenNodeIds: raw.overriddenNodeIds ?? [],
      componentProperties: raw.componentProperties ?? {},
      exposedInstanceIds: raw.exposedInstanceIds ?? [],
      layerOverrides: raw.layerOverrides ?? [],
      unreadableNodes: raw.unreadableNodes ?? 0,
    };
  }

  const ids = Array.isArray(p.nodeIds)
    ? (p.nodeIds as string[])
    : [String(p.nodeId)];
  const results: Array<Record<string, unknown>> = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    let target: InstanceNode;
    try {
      target = await requireInstance(id);
    } catch (e) {
      results.push({
        id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    if (target.id === source.sourceInstanceId) {
      results.push({ id, ok: true, skipped: "is the source instance" });
      continue;
    }

    const main = await target.getMainComponentAsync();
    if (source.mainComponentId && main && main.id !== source.mainComponentId) {
      // Variants of one set are DIFFERENT main components, and copying across
      // them is usually the intent ("make these all look like that one"), so
      // this is a warning and a skip only when the set differs too.
      const sameSet =
        main.parent?.type === "COMPONENT_SET" &&
        (await sharesSet(main, source.mainComponentId));
      if (!sameSet) {
        results.push({
          id,
          ok: false,
          error: `instance of "${main.name}" but the source came from a different component`,
        });
        ctx.warn(
          `Skipped ${id}: different main component. Component property keys are per-component, so the diff would not mean the same thing.`,
        );
        continue;
      }
    }

    const entry: Record<string, unknown> = { id, ok: true };
    if (Object.keys(source.componentProperties).length > 0) {
      entry.properties = await applyProperties(
        target,
        source.componentProperties,
        ctx,
      );
    }
    entry.layers = await writeLayerOverrides(target, source.layerOverrides, ctx);
    results.push(entry);
    if (ids.length > 5 && (i + 1) % 5 === 0)
      ctx.progress(i + 1, ids.length, "applying overrides");
  }

  const applied = results.filter((r) => r.ok).length;
  return {
    sourceInstanceId: source.sourceInstanceId,
    targets: ids.length,
    applied,
    failed: ids.length - applied,
    results,
    ...(source.unreadableNodes > 0
      ? {
          note: `${source.unreadableNodes} source layer(s) had fields this tool does not copy; they were not applied.`,
        }
      : {}),
  };
}

/** Do two main components belong to the same component set? */
async function sharesSet(
  main: ComponentNode,
  otherId: string,
): Promise<boolean> {
  const other = await findNode(otherId);
  if (!other || other.type !== "COMPONENT") return false;
  const a = main.parent?.type === "COMPONENT_SET" ? main.parent.id : null;
  const b =
    (other as ComponentNode).parent?.type === "COMPONENT_SET"
      ? (other as ComponentNode).parent!.id
      : null;
  return a !== null && a === b;
}

/** set_instance_properties — the plain property setter. */
export async function setInstanceProperties(
  ctx: HandlerContext,
): Promise<unknown> {
  const instance = await requireInstance(ctx.params.nodeId ?? ctx.params.id);
  const outcome = await applyProperties(
    instance,
    (ctx.params.props ?? {}) as Record<string, unknown>,
    ctx,
  );
  const main = await instance.getMainComponentAsync();
  return {
    id: instance.id,
    ...outcome,
    // The live keys, so a failed name can be fixed without a second read.
    availableProperties: Object.keys(instance.componentProperties ?? {}),
    mainComponentId: main?.id ?? null,
    properties: flattenComponentProperties(
      instance.componentProperties as unknown as Record<
        string,
        { type?: string; value?: unknown }
      >,
    ),
  };
}

/**
 * expose_nested_instance — surface a nested instance's properties on the
 * parent's own property panel.
 *
 * The flag lives on the NESTED instance (inside the main component), not on
 * the placed instance — setting it on a placed one is a no-op that reports
 * success, so that case is refused with the reason.
 */
export async function exposeNestedInstance(
  ctx: HandlerContext,
): Promise<unknown> {
  const p = ctx.params;
  const instance = await requireInstance(p.nodeId ?? p.id);
  const exposed = p.exposed === undefined ? true : p.exposed === true;

  // Walk up: the flag only has meaning for an instance that sits inside a
  // COMPONENT (the main), because that is what the panel is generated from.
  let ancestor: BaseNode | null = instance.parent;
  let insideMain = false;
  while (ancestor) {
    if (ancestor.type === "COMPONENT" || ancestor.type === "COMPONENT_SET") {
      insideMain = true;
      break;
    }
    if (ancestor.type === "PAGE" || ancestor.type === "DOCUMENT") break;
    ancestor = ancestor.parent;
  }
  if (!insideMain) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `Instance "${instance.name}" is not nested inside a main component, so exposing it would do nothing.`,
      "Run this on the instance INSIDE the component you are authoring, not on a placed copy of that component.",
    );
  }

  instance.isExposedInstance = exposed;
  return {
    id: instance.id,
    exposed: instance.isExposedInstance,
    ownerId: ancestor!.id,
    ownerName: (ancestor as ComponentNode).name,
  };
}

/** detach_instance — cut the link to the main component. */
export async function detachInstance(ctx: HandlerContext): Promise<unknown> {
  const instance = await requireInstance(ctx.params.nodeId ?? ctx.params.id);
  const main = await instance.getMainComponentAsync();
  const frame = instance.detachInstance();
  ctx.warn(
    `Detached from "${main?.name ?? "its main component"}" — the result is a plain frame and will not receive future component updates.`,
  );
  return {
    id: frame.id,
    // The id CHANGES on detach. A caller holding the instance id is holding a
    // dead reference from here on, and finding that out three ops later is a
    // bad time.
    previousId: instance.id,
    detachedFrom: main?.id ?? null,
    node: serializeNode(frame, "compact"),
  };
}

/** reset_instance_overrides — put every layer back to the main's values. */
export async function resetInstanceOverrides(
  ctx: HandlerContext,
): Promise<unknown> {
  const instance = await requireInstance(ctx.params.nodeId ?? ctx.params.id);
  const before = (instance.overrides ?? []).length;
  instance.resetOverrides();
  const after = (instance.overrides ?? []).length;
  return {
    id: instance.id,
    overridesBefore: before,
    overridesAfter: after,
    // Not always zero: an override on a nested instance's own property can
    // survive the reset, and reporting 0 when Figma still lists two is how a
    // caller ends up debugging its own correct code.
    fullyReset: after === 0,
  };
}

/**
 * match_main_values — what has drifted from the main component, and
 * optionally put it back.
 *
 * The report is the point. "Which of these 40 instances has someone hand-
 * edited?" is a question the Figma UI cannot answer and a design system
 * review always asks.
 *
 * `apply` is deliberately partial: Figma offers resetOverrides() on an
 * INSTANCE and nowhere else, so a drifted plain layer (a retyped label inside
 * a non-instance child) can be reported but not individually reverted. Those
 * come back under `unresettable` instead of being quietly counted as fixed.
 */
export async function matchMainValues(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const instance = await requireInstance(p.nodeId ?? p.id);
  const main = await instance.getMainComponentAsync();
  const apply = p.apply === true;

  const drifted: Array<{
    id: string;
    layer: string;
    type: string;
    fields: string[];
    resettable: boolean;
  }> = [];

  for (const entry of instance.overrides ?? []) {
    const node = (await findNode(entry.id)) as SceneNode | null;
    drifted.push({
      id: entry.id,
      layer: node?.name ?? "(unresolved)",
      type: node?.type ?? "?",
      fields: [...((entry.overriddenFields ?? []) as string[])],
      resettable: node?.type === "INSTANCE",
    });
  }

  const report = {
    id: instance.id,
    mainComponentId: main?.id ?? null,
    mainComponentName: main?.name ?? null,
    driftedLayers: drifted.length,
    drifted,
  };

  if (!apply) {
    return {
      ...report,
      applied: false,
      hint:
        drifted.length === 0
          ? "This instance matches its main component."
          : "Pass apply: true to reset it, or reset_instance_overrides to clear everything in one go.",
    };
  }

  // Whole-instance reset is the only complete mechanism; the per-node loop
  // exists for the case where the caller reset the parent already and only
  // nested instances still differ.
  const before = drifted.length;
  instance.resetOverrides();
  const remaining = [...(instance.overrides ?? [])];
  const unresettable: string[] = [];
  for (const entry of remaining) {
    const node = (await findNode(entry.id)) as SceneNode | null;
    if (node?.type === "INSTANCE") (node as InstanceNode).resetOverrides();
    else unresettable.push(node?.name ?? entry.id);
  }

  return {
    ...report,
    applied: true,
    resetCount: before - (instance.overrides ?? []).length,
    ...(unresettable.length > 0
      ? {
          unresettable,
          note: "These layers still differ from the main component. The Plugin API can only reset an INSTANCE, so revert them by hand or rebuild the instance.",
        }
      : {}),
  };
}
