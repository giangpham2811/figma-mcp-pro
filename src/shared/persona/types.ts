/**
 * Persona: who this is being built for, in the form a team can argue with.
 *
 * The other kinds describe the product — what the user moves through, what
 * the system stores, who does which step. This one describes the person the
 * product is wrong or right FOR, and it is the only kind here whose value is
 * destroyed by being decorative. A persona that lists an age, a city and a
 * stock photo settles no argument. One that says what this person is trying
 * to get done, and what currently stops them, settles several.
 *
 * So the shape below makes the useful fields structural and the decorative
 * ones optional, and the checker reports a persona built out of the
 * decorative ones. That is a deliberate opinion, and it is Cooper's: a
 * persona is a behavioural model, not a demographic one.
 */
import type { FlowClass, Placement, DrawFrameExtras } from "../diagram/types.js";

export type { FlowClass, Placement } from "../diagram/types.js";

/**
 * How central this person is to the decision being made.
 *  - `primary`   the one the product is designed for. Ideally exactly one:
 *                designing for two primaries produces a product that fits
 *                neither, which is the whole reason the role exists.
 *  - `secondary` accommodated, never at the primary's expense.
 *  - `served`    affected by the product without using it — the patient whose
 *                record a nurse types in, the payee on an invoice.
 *  - `negative`  explicitly NOT built for. Naming these is what stops a
 *                backlog drifting towards whoever shouts loudest.
 */
export type PersonaRole = "primary" | "secondary" | "served" | "negative";

export interface PersonaSpec {
  id: string;
  /** What to call them. A name, not "User A" — the point is to be memorable. */
  name?: string;
  /** Their job or relationship to the product: "Kế toán trưởng". */
  title?: string;
  role?: PersonaRole;
  /**
   * One sentence in their own words, from research. Drawn large, because it
   * is the part people remember and quote back in planning.
   */
  quote?: string;
  /**
   * What they are trying to achieve. The load-bearing field: a persona with
   * no goals cannot settle a prioritisation argument, which is what a persona
   * is for, so the checker reports it.
   */
  goals?: string[];
  /** What currently stops them. The other load-bearing field. */
  frustrations?: string[];
  /**
   * How they actually behave today — the workaround spreadsheet, the phone
   * call instead of the form. This is what separates a behavioural persona
   * from a demographic one.
   */
  behaviours?: string[];
  /** What they use now, including the competitor and the paper notebook. */
  tools?: string[];
  /**
   * Facts about them: age, location, team size. Optional and LAST on purpose.
   * A persona made only of these is reported.
   */
  demographics?: Record<string, string | number>;
  /** A sentence of context: when and where they meet the product. */
  scenario?: string;
  /**
   * The artboard(s) or journey stage(s) this persona is used in, so the
   * cross-check can ask whether anybody is designing for them at all.
   */
  screenId?: string | string[];
  cls?: FlowClass;
}

export interface PersonaOptions {
  font?: string;
  /** Cards per row. Default 3 — four is where the text gets too narrow. */
  columns?: number;
  /**
   * Business rules with a value, referenced from text as `@name`. Shared with
   * every other kind, so one rule quoted in a persona and in an activity
   * diagram is the same rule.
   */
  policies?: Record<string, string | number>;
  /** Check the model and report, draw nothing. */
  dryRun?: boolean;
}

export interface PersonaDiagramSpec {
  /** The compact line form — use this OR `personas`. */
  text?: string;
  title: string;
  subtitle?: string;
  parentId?: string;
  x?: number;
  y?: number;
  personas?: PersonaSpec[];
  options?: PersonaOptions;
}

// ---- draw data (what crosses the bridge to the plugin) ----

/** One titled block of bullets inside a card. */
export interface DrawSection {
  label: string;
  /** Already wrapped to the card's inner width. */
  items: string[][];
  /** Muted sections read as supporting material, not as the headline. */
  muted: boolean;
}

export interface DrawPersona {
  id: string;
  /** Layer name: `persona:<id> · <name>`, the handle a reflow finds it by. */
  name: string;
  at: Placement;
  fill: string;
  stroke: string;
  /** The accent bar and the role chip take this. */
  accent: string;
  role: PersonaRole;
  roleLabel: string;
  /** Two initials for the avatar disc — no stock photography. */
  initials: string;
  displayName: string;
  title: string;
  quote: string[];
  scenario: string[];
  sections: DrawSection[];
  /** `· 01 · 02` under the name. */
  screenId?: string[];
}

export interface PersonaDraw extends DrawFrameExtras {
  name: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
  h: number;
  parentId?: string;
  personas: DrawPersona[];
  font: string;
}

export interface PersonaBuild {
  draw: PersonaDraw;
  /** The merged, checked model, with nothing about WHERE the frame goes. */
  model: PersonaDiagramSpec;
  warnings: string[];
  stats: {
    personas: number;
    primaries: number;
    /** Personas carrying at least one goal AND one frustration. */
    actionable: number;
    w: number;
    h: number;
  };
}
