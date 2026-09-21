/**
 * Avatar generation for UI mockups.
 *
 * Server-side, and it reuses the plugin's `load_icon` op rather than adding
 * one of its own: both ops do exactly the same thing on the plugin side —
 * take SVG markup, `createNodeFromSvg`, fit it to a size, place it. A second
 * handler for that would be a second place for the SVG-import bypass to go
 * wrong (see ARCHITECTURE.md on builders that cannot use `createTree`).
 *
 * Deterministic by seed, which is the property that matters for a mockup: the
 * same name gives the same face on every re-render, so a screenshot taken
 * today and a redraw next week show the same person. Random avatars make a
 * design review about the avatars.
 */
import { createAvatar, type Style } from "@dicebear/core";
import * as collection from "@dicebear/collection";

/** Styles worth offering for product UI, grouped by what they are FOR. */
export const AVATAR_STYLES = [
  // People — for anything showing real users.
  "initials",
  "lorelei",
  "notionists",
  "avataaars",
  "micah",
  "openPeeps",
  "personas",
  "adventurer",
  "bigSmile",
  "miniavs",
  "dylan",
  "thumbs",
  // Abstract — for orgs, teams, and anywhere a face would over-specify.
  "shapes",
  "identicon",
  "rings",
  "glass",
  "bottts",
  "pixelArt",
  "funEmoji",
  "icons",
] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number];

export interface AvatarOptions {
  style?: string;
  size?: number;
  /** Background colours, hex without `#`. Several means one is picked by seed. */
  backgroundColor?: string[];
  radius?: number;
  /** Anything else the chosen DiceBear style accepts. */
  [k: string]: unknown;
}

export interface GeneratedAvatar {
  svg: string;
  style: AvatarStyle;
  seed: string;
  size: number;
}

function normalizeHex(v: string): string {
  return v.replace(/^#/, "").trim();
}

/**
 * Build one avatar SVG.
 *
 * `initials` is the default rather than a face, and that is a deliberate
 * choice about what a mockup claims: a generated face reads as a specific
 * person and pulls a review towards "who is this?", while initials read as a
 * placeholder, which is what it is.
 */
export function generateAvatar(seed: string, opts: AvatarOptions = {}): GeneratedAvatar {
  const requested = String(opts.style ?? "initials");
  const style = (AVATAR_STYLES as readonly string[]).includes(requested)
    ? (requested as AvatarStyle)
    : null;
  if (!style) {
    throw new Error(
      `Unknown avatar style "${requested}". Available: ${AVATAR_STYLES.join(", ")}.`,
    );
  }
  const size = typeof opts.size === "number" && opts.size > 0 ? Math.min(512, opts.size) : 64;

  const { style: _s, size: _z, backgroundColor, ...rest } = opts;
  const svg = createAvatar(collection[style] as Style<Record<string, unknown>>, {
    seed,
    size,
    ...(Array.isArray(backgroundColor) && backgroundColor.length
      ? { backgroundColor: backgroundColor.map(normalizeHex) }
      : {}),
    ...rest,
  }).toString();

  return { svg, style, seed, size };
}
