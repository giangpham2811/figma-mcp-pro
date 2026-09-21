/// <reference types="@figma/plugin-typings" />
/**
 * generate_design_system / apply_design_system / audit_design_system.
 *
 * The generator draws nothing itself. It turns a style recipe into token
 * definitions and `create()` specs, then hands both to the machinery that
 * already exists — `setupTokens`, `setupTextStyles`, `setupEffectStyles`,
 * `createTree`, `createVariants`. Every safe default, font fallback and
 * keep-clear rule therefore applies to generated components exactly as it
 * does to hand-written ones, and there is one drawing pipeline in this
 * codebase rather than two that drift.
 *
 * Idempotence is the other design rule. Running this twice must not produce
 * "Button" and "Button 2": a COMPONENT cannot be removed through the Plugin
 * API (remove() is a silent no-op) and every instance a designer has placed
 * binds by id, so the second run REBUILDS the component that already exists,
 * in place, keeping its id. `createTree`'s `into` parameter is there for
 * exactly this.
 */
import { HandlerContext, findNode } from "../context.js";
import { err } from "../errors.js";
import { ErrorCode } from "../../shared/protocol.js";
import { createTree } from "./create.js";
import { setupTokens } from "./tokens.js";
import { setupTextStyles, setupEffectStyles } from "./styles.js";
import {
  STYLES,
  STYLE_IDS,
  buildTokens,
  checkContrast,
  typeScale,
  type StyleRecipe,
  type ShadowSpec,
  type TokenSet,
} from "../../shared/design-system/styles.js";
import {
  buildCatalog,
  GROUP_ORDER,
  type Blueprint,
} from "../../shared/design-system/catalog.js";
import { contrastRatio } from "../../shared/design-system/color.js";

/** Hex + alpha → the "#RRGGBBAA" spelling setup_effect_styles wants. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

function effectSpecs(shadows: ShadowSpec[]): unknown[] {
  return shadows.map((s) => ({
    type: s.type,
    color: withAlpha(s.color, s.alpha),
    offset: { x: s.x, y: s.y },
    radius: s.blur,
    ...(s.spread ? { spread: s.spread } : {}),
  }));
}

function resolveRecipe(params: Record<string, unknown>): StyleRecipe {
  const id = String(params.style ?? "neutral");
  const recipe = STYLES[id];
  if (!recipe) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      `Unknown style "${id}".`,
      `Available: ${STYLE_IDS.join(", ")}.`,
    );
  }
  return recipe;
}

/** A child context carrying different params but the same warning sink. */
function sub(ctx: HandlerContext, params: Record<string, unknown>): HandlerContext {
  return { ...ctx, params };
}

/**
 * Find a component (or set) already on the page by the name we would give it.
 *
 * Name-based, and that is a real limitation rather than an oversight: the
 * generator has no other handle across runs, because Figma ids are not
 * stable across files and nothing persists a manifest. Renaming a generated
 * component therefore orphans it, and the next run makes a fresh one. That
 * is documented rather than worked around, because the alternative — writing
 * a manifest into plugin data and reconciling against it — is a whole
 * subsystem to save a rename nobody does often.
 */
function findExisting(
  page: PageNode,
  name: string,
): ComponentNode | ComponentSetNode | null {
  for (const child of page.children) {
    if (child.type === "COMPONENT" || child.type === "COMPONENT_SET") {
      if (child.name === name) return child;
    }
    // One level down: the generator parks components inside group frames.
    if (child.type === "FRAME") {
      for (const inner of child.children) {
        if (
          (inner.type === "COMPONENT" || inner.type === "COMPONENT_SET") &&
          inner.name === name
        ) {
          return inner;
        }
      }
    }
  }
  return null;
}

interface BuiltComponent {
  name: string;
  id: string;
  type: "COMPONENT" | "COMPONENT_SET";
  variants: number;
  rebuilt: boolean;
}

/**
 * Build one blueprint into a component (or a set of variants).
 *
 * Variant components are named "Prop=Value, Prop2=Value2" because that is
 * how Figma derives the set's properties — `combineAsVariants` has no other
 * input for them.
 */
async function buildOne(
  ctx: HandlerContext,
  bp: Blueprint,
  parent: FrameNode,
  page: PageNode,
): Promise<BuiltComponent> {
  const existing = findExisting(page, bp.name);

  if (!bp.variants || bp.variants.length === 0) {
    const spec = { ...(bp.spec ?? {}), name: bp.name };
    if (existing && existing.type === "COMPONENT") {
      // Rebuild in place: the id survives, so placed instances survive.
      for (const child of [...existing.children]) child.remove();
      await createTree(sub(ctx, spec), undefined, existing);
      existing.description = bp.description;
      return { name: bp.name, id: existing.id, type: "COMPONENT", variants: 0, rebuilt: true };
    }
    const node = await createTree(sub(ctx, spec), parent);
    const component = figma.createComponentFromNode(node as SceneNode);
    component.name = bp.name;
    component.description = bp.description;
    parent.appendChild(component);
    return { name: bp.name, id: component.id, type: "COMPONENT", variants: 0, rebuilt: false };
  }

  // A set: build each variant as its own component first.
  const made: ComponentNode[] = [];
  for (const v of bp.variants) {
    const variantName = Object.entries(v.props)
      .map(([k, val]) => `${k}=${val}`)
      .join(", ");
    const node = await createTree(sub(ctx, { ...v.spec, name: variantName }), parent);
    const c = figma.createComponentFromNode(node as SceneNode);
    c.name = variantName;
    made.push(c);
  }

  if (existing && existing.type === "COMPONENT_SET") {
    // A set cannot be rebuilt in place the way a component can, because its
    // children ARE the components. Move the fresh variants in and drop the
    // stale ones; the SET keeps its id, so instances keep pointing at it.
    const stale = [...existing.children];
    for (const c of made) existing.appendChild(c);
    for (const s of stale) s.remove();
    existing.description = bp.description;
    return {
      name: bp.name,
      id: existing.id,
      type: "COMPONENT_SET",
      variants: made.length,
      rebuilt: true,
    };
  }

  const set = figma.combineAsVariants(made, parent);
  set.name = bp.name;
  set.description = bp.description;
  // combineAsVariants invents a corner radius and a dashed stroke. Nothing in
  // the generator chose either; left alone they read as a design decision.
  set.cornerRadius = 0;
  return { name: bp.name, id: set.id, type: "COMPONENT_SET", variants: made.length, rebuilt: false };
}

/** Lay a group's components out on a grid inside its frame. */
function arrangeGroup(frame: FrameNode, gap = 48): void {
  const kids = [...frame.children];
  if (kids.length === 0) return;
  const columns = Math.max(1, Math.ceil(Math.sqrt(kids.length)));
  const cellW = Math.max(...kids.map((k) => k.width));
  let y = 0;
  let rowH = 0;
  kids.forEach((kid, i) => {
    const colIndex = i % columns;
    if (colIndex === 0 && i > 0) {
      y += rowH + gap;
      rowH = 0;
    }
    kid.x = colIndex * (cellW + gap);
    kid.y = y;
    rowH = Math.max(rowH, kid.height);
  });
  const rows = Math.ceil(kids.length / columns);
  frame.resizeWithoutConstraints(
    Math.max(1, columns * cellW + (columns - 1) * gap),
    Math.max(1, y + rowH),
  );
  void rows;
}

/**
 * generate_design_system — tokens, styles and sixty components in one call.
 */
export async function generateDesignSystem(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const recipe = resolveRecipe(p);
  const hue = typeof p.hue === "number" ? p.hue : 250;
  const modes = p.modes !== false;
  const tokens: TokenSet = buildTokens(recipe, {
    hue,
    chroma: typeof p.chroma === "number" ? p.chroma : undefined,
    modes,
  });

  // 1. Variables. Everything downstream references these by name, so a
  //    failure here is fatal rather than partial — a catalog drawn against
  //    missing tokens is sixty components of hardcoded black.
  const tokenResult = await setupTokens(sub(ctx, { tokens }));

  // 2. Text styles, from the type scale.
  const scale = typeScale(recipe);
  const textStyles = Object.entries(scale).map(([name, size]) => ({
    name: `text/${name}`,
    fontSize: size,
    fontFamily: name === "3xl" || name === "4xl" ? recipe.font.display : recipe.font.sans,
    // Display sizes tighten; body sizes do not. A 48px heading at 1.5
    // line-height has a hole in the middle of it.
    lineHeight: size >= 28 ? "115%" : "145%",
    letterSpacing: size >= 28 ? `${recipe.letterSpacingTight * 100}%` : "0%",
  }));
  const textResult = await setupTextStyles(sub(ctx, { styles: textStyles }));

  // 3. Effect styles, only for styles that use elevation.
  let effectResult: unknown = { skipped: "this style uses no shadows" };
  const levels = (["sm", "md", "lg"] as const).filter(
    (l) => recipe.shadows[l].length > 0,
  );
  if (levels.length > 0) {
    effectResult = await setupEffectStyles(
      sub(ctx, {
        styles: levels.map((l) => ({
          name: `elevation/${l}`,
          effects: effectSpecs(recipe.shadows[l]),
        })),
      }),
    );
  }

  // 4. The page.
  const pageName = String(p.page ?? `Design System — ${recipe.label}`);
  let page = figma.root.children.find(
    (c) => c.type === "PAGE" && c.name === pageName,
  ) as PageNode | undefined;
  if (!page) {
    try {
      page = figma.createPage();
      page.name = pageName;
    } catch (e) {
      ctx.warn(
        `Could not create a page (${e instanceof Error ? e.message : String(e)}); generating onto the current page instead.`,
      );
      page = figma.currentPage;
    }
  }
  await page.loadAsync?.();

  // 5. The catalog.
  const all = buildCatalog(recipe);
  const only = Array.isArray(p.components)
    ? new Set((p.components as string[]).map((s) => s.toLowerCase()))
    : null;
  const wanted = only
    ? all.filter(
        (b) => only.has(b.name.toLowerCase()) || only.has(b.group.toLowerCase()),
      )
    : all;
  if (wanted.length === 0) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      "No blueprint matched the requested components.",
      `Names look like "Forms/Input"; groups are ${GROUP_ORDER.join(", ")}.`,
    );
  }

  const built: BuiltComponent[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  let groupY = 0;

  for (const group of GROUP_ORDER) {
    const members = wanted.filter((b) => b.group === group);
    if (members.length === 0) continue;

    let frame = page.children.find(
      (c) => c.type === "FRAME" && c.name === `— ${group} —`,
    ) as FrameNode | undefined;
    if (!frame) {
      frame = figma.createFrame();
      frame.name = `— ${group} —`;
      frame.fills = [];
      frame.clipsContent = false;
      page.appendChild(frame);
    }
    frame.x = 0;
    frame.y = groupY;

    for (let i = 0; i < members.length; i++) {
      const bp = members[i]!;
      try {
        built.push(await buildOne(ctx, bp, frame, page));
      } catch (e) {
        // One bad blueprint must not cost the other fifty-nine. The failure
        // is reported by name so it can be re-run alone with `components`.
        failed.push({ name: bp.name, error: e instanceof Error ? e.message : String(e) });
      }
      ctx.progress(built.length + failed.length, wanted.length, `building ${bp.name}`);
    }
    arrangeGroup(frame);
    groupY += frame.height + 160;
  }

  // 6. Report contrast from the tokens actually written, in both modes.
  const contrast = [
    ...checkContrast(tokens, "light").map((f) => ({ ...f, mode: "light" })),
    ...(modes ? checkContrast(tokens, "dark").map((f) => ({ ...f, mode: "dark" })) : []),
  ].filter((f) => !f.passes);
  for (const f of contrast) {
    ctx.warn(
      `${f.mode}: ${f.token} is ${f.ratio}:1, under the ${f.required}:1 it needs.`,
    );
  }

  return {
    style: recipe.id,
    styleLabel: recipe.label,
    note: recipe.note,
    pageId: page.id,
    pageName: page.name,
    tokens: tokenResult,
    textStyles: textResult,
    effectStyles: effectResult,
    components: built.length,
    rebuilt: built.filter((b) => b.rebuilt).length,
    sets: built.filter((b) => b.type === "COMPONENT_SET").length,
    built,
    ...(failed.length > 0 ? { failed } : {}),
    contrastFindings: contrast,
    hint:
      failed.length > 0
        ? `Re-run the failures alone with components: [${failed.map((f) => `"${f.name}"`).join(", ")}].`
        : "Re-running with a different hue or style rebuilds these components in place; placed instances keep working.",
  };
}

/**
 * apply_design_system — re-theme an existing subtree onto the tokens.
 *
 * Binds variables to fills, strokes and radii where a node's current literal
 * value matches a token's value. It does NOT guess at near-matches: a fill
 * that is one shade off a token is a decision somebody made, and silently
 * snapping it is how a re-theme eats a deliberate highlight.
 */
export async function applyDesignSystem(ctx: HandlerContext): Promise<unknown> {
  const p = ctx.params;
  const root = p.nodeId ? await findNode(p.nodeId) : figma.currentPage;
  if (!root) {
    throw err(ErrorCode.NODE_NOT_FOUND, `No node with id "${String(p.nodeId)}".`);
  }

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const vars = await figma.variables.getLocalVariablesAsync();
  if (vars.length === 0) {
    throw err(
      ErrorCode.INVALID_PARAMS,
      "This file has no local variables to apply.",
      "Run generate_design_system first, or setup_tokens with your own token set.",
    );
  }

  // hex → variable, for the default mode of each collection.
  const byHex = new Map<string, Variable>();
  for (const v of vars) {
    if (v.resolvedType !== "COLOR") continue;
    const collection = collections.find((c) => c.id === v.variableCollectionId);
    const modeId = collection?.defaultModeId ?? Object.keys(v.valuesByMode)[0];
    const value = modeId ? v.valuesByMode[modeId] : undefined;
    if (!value || typeof value !== "object" || !("r" in value)) continue;
    const c = value as RGBA;
    const hex = `#${[c.r, c.g, c.b]
      .map((x) => Math.round(x * 255).toString(16).padStart(2, "0"))
      .join("")}`;
    if (!byHex.has(hex)) byHex.set(hex, v);
  }

  const nodes =
    "findAll" in root ? (root as ChildrenMixin & SceneNode).findAll(() => true) : [];
  const targets = "type" in root && root.type !== "PAGE" ? [root as SceneNode, ...nodes] : nodes;

  let boundFills = 0;
  let boundStrokes = 0;
  const unmatched = new Map<string, number>();

  for (const node of targets) {
    for (const field of ["fills", "strokes"] as const) {
      const paints = (node as GeometryMixin)[field];
      if (!Array.isArray(paints) || paints.length === 0) continue;
      const first = paints[0];
      if (!first || first.type !== "SOLID") continue;
      const c = first.color;
      const hex = `#${[c.r, c.g, c.b]
        .map((x) => Math.round(x * 255).toString(16).padStart(2, "0"))
        .join("")}`;
      const variable = byHex.get(hex);
      if (!variable) {
        unmatched.set(hex, (unmatched.get(hex) ?? 0) + 1);
        continue;
      }
      try {
        const bound = figma.variables.setBoundVariableForPaint(
          first as SolidPaint,
          "color",
          variable,
        );
        (node as GeometryMixin)[field] = [bound, ...paints.slice(1)];
        if (field === "fills") boundFills++;
        else boundStrokes++;
      } catch {
        /* a locked or remote node; counted as unmatched below */
      }
    }
  }

  const leftovers = [...unmatched.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([hex, count]) => ({ hex, count }));

  return {
    scanned: targets.length,
    boundFills,
    boundStrokes,
    // The interesting half of the answer. A re-theme that binds 40 fills and
    // leaves 300 literals is not a re-theme, and a bare success count hides
    // that completely.
    unmatchedColors: leftovers,
    unmatchedTotal: [...unmatched.values()].reduce((a, b) => a + b, 0),
    hint:
      leftovers.length > 0
        ? "These colours matched no token. Either add them to the token set, or they are deliberate one-offs — this tool will not guess."
        : "Every solid colour in the subtree is now bound to a variable.",
  };
}

/**
 * audit_design_system — is what is in this file actually a system?
 *
 * Four questions, and each one is a way a design system rots that nobody
 * notices from inside Figma: colours that never became tokens, components
 * nobody uses, near-duplicate names, and text contrast that fails.
 */
export async function auditDesignSystem(ctx: HandlerContext): Promise<unknown> {
  await figma.loadAllPagesAsync?.();
  const root = figma.root;

  const components = (
    typeof root.findAllWithCriteria === "function"
      ? root.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] })
      : root.findAll((n) => n.type === "COMPONENT" || n.type === "COMPONENT_SET")
  ) as Array<ComponentNode | ComponentSetNode>;
  const topLevel = components.filter(
    (c) => !(c.type === "COMPONENT" && c.parent?.type === "COMPONENT_SET"),
  );

  const instances = root.findAllWithCriteria
    ? (root.findAllWithCriteria({ types: ["INSTANCE"] }) as InstanceNode[])
    : (root.findAll((n) => n.type === "INSTANCE") as InstanceNode[]);

  // 1. Unused components.
  const used = new Set<string>();
  for (const inst of instances) {
    const main = await inst.getMainComponentAsync();
    if (!main) continue;
    used.add(main.id);
    if (main.parent?.type === "COMPONENT_SET") used.add(main.parent.id);
  }
  const unused = topLevel
    .filter((c) => !used.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  // 2. Near-duplicate names — "Button" and "Button Copy" and "button 2".
  const norm = (s: string): string =>
    s.toLowerCase().replace(/\b(copy|copy \d+|\d+)\b/g, "").replace(/[^a-z]/g, "");
  const byNorm = new Map<string, string[]>();
  for (const c of topLevel) {
    const k = norm(c.name);
    if (!k) continue;
    byNorm.set(k, [...(byNorm.get(k) ?? []), c.name]);
  }
  const duplicates = [...byNorm.values()].filter((names) => names.length > 1);

  // 3. Literal colours that never became tokens.
  const vars = await figma.variables.getLocalVariablesAsync();
  const hasTokens = vars.some((v) => v.resolvedType === "COLOR");
  const literalCounts = new Map<string, number>();
  for (const c of topLevel) {
    const nodes = "findAll" in c ? c.findAll(() => true) : [];
    for (const n of [c as SceneNode, ...nodes]) {
      const fills = (n as GeometryMixin).fills;
      if (!Array.isArray(fills)) continue;
      for (const f of fills) {
        if (f.type !== "SOLID") continue;
        const bound = (f as SolidPaint).boundVariables?.color;
        if (bound) continue;
        const col = f.color;
        const hex = `#${[col.r, col.g, col.b]
          .map((x) => Math.round(x * 255).toString(16).padStart(2, "0"))
          .join("")}`;
        literalCounts.set(hex, (literalCounts.get(hex) ?? 0) + 1);
      }
    }
  }
  const literals = [...literalCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([hex, count]) => ({ hex, count }));

  // 4. Text contrast inside components, against the nearest filled ancestor.
  const contrastIssues: Array<{
    component: string;
    text: string;
    ratio: number;
    fg: string;
    bg: string;
  }> = [];
  const hexOf = (paints: unknown): string | null => {
    if (!Array.isArray(paints)) return null;
    const solid = paints.find((f) => (f as Paint).type === "SOLID") as SolidPaint | undefined;
    if (!solid || solid.visible === false) return null;
    const c = solid.color;
    return `#${[c.r, c.g, c.b]
      .map((x) => Math.round(x * 255).toString(16).padStart(2, "0"))
      .join("")}`;
  };

  for (const c of topLevel) {
    const texts = "findAll" in c ? (c.findAll((n) => n.type === "TEXT") as TextNode[]) : [];
    for (const t of texts) {
      const fg = hexOf(t.fills);
      if (!fg) continue;
      let anc: BaseNode | null = t.parent;
      let bg: string | null = null;
      while (anc && anc.type !== "PAGE") {
        bg = hexOf((anc as GeometryMixin).fills);
        if (bg) break;
        anc = anc.parent;
      }
      // No filled ancestor means the component sits on the canvas; Figma's
      // canvas is light grey, and guessing white here would manufacture
      // findings that are not real.
      if (!bg) continue;
      const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
      const large = t.fontSize !== figma.mixed && (t.fontSize as number) >= 24;
      if (ratio < (large ? 3 : 4.5)) {
        contrastIssues.push({ component: c.name, text: t.characters.slice(0, 40), ratio, fg, bg });
      }
    }
  }

  const findings =
    unused.length + duplicates.length + literals.length + contrastIssues.length;
  return {
    components: topLevel.length,
    instances: instances.length,
    hasColorTokens: hasTokens,
    unusedComponents: unused,
    duplicateNames: duplicates,
    literalColors: literals,
    contrastIssues,
    findings,
    verdict:
      findings === 0
        ? "No findings. Every component is used, named distinctly, tokenised and legible."
        : `${findings} finding(s). Unused components and literal colours are the two that compound — each one makes the next re-theme more manual.`,
  };
}
