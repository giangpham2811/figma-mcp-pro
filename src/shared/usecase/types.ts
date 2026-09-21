/**
 * Use case diagram: what the system does FOR someone, and who that someone is.
 *
 * The scope question, and the one this kind exists to settle: everything
 * inside the system boundary is what is being built, everything outside it is
 * who or what it is being built for. An argument about scope is an argument
 * about where that rectangle goes, and having the rectangle on a wall ends
 * the argument faster than a document does.
 *
 * Deliberately NOT a flowchart. A use case is a goal ("Chia tiền bữa ăn"),
 * not a step, and there is no ordering between them — which is why there is
 * no edges array and no arrows between use cases except the two UML defines:
 *
 *   include  — A always does B as part of itself. Factored-out common work.
 *   extend   — B sometimes adds itself to A. Optional or exceptional work.
 *
 * Both are dashed, both are labelled with their stereotype, and both point in
 * the direction UML says, which is the opposite of what people expect for
 * `extend`: the arrow runs from the EXTENSION to the base, because the base
 * does not know its extensions exist. Getting that backwards is the most
 * common error in hand-drawn use case diagrams, so the checker does not
 * silently correct it — it draws what was written.
 */
import type { Placement, DrawFrameExtras } from "../diagram/types.js";

export type { Placement } from "../diagram/types.js";

/**
 * Where an actor stands relative to the system.
 *  - `primary`   initiates a use case to achieve a goal of their own. Drawn
 *                on the LEFT, which is the UML convention and the reason the
 *                diagram reads left to right.
 *  - `secondary` the system calls on THEM — a payment gateway, an SMS
 *                provider, a colleague who approves something. Drawn right.
 *  - `system`    another system rather than a person. Drawn right, as a box
 *                rather than a stick figure, because a stick figure for
 *                "Ngân hàng" invites people to think a human is involved.
 */
export type ActorKind = "primary" | "secondary" | "system";

export interface ActorSpec {
  id: string;
  label?: string;
  kind?: ActorKind;
  /** One line of who they are, drawn small under the name. */
  detail?: string;
}

export interface UseCaseSpec {
  id: string;
  /**
   * The goal in the business's words, phrased as something achieved:
   * "Chốt sổ cuối tháng". Not "Màn hình chốt sổ" — that is a screen, and a
   * use case named after a screen is a feature list wearing UML.
   */
  label?: string;
  /** Actor ids that take part. A use case with none is reported. */
  actors?: string[];
  /** Use case ids this one ALWAYS performs as part of itself. */
  includes?: string[];
  /**
   * Use case ids this one OPTIONALLY adds to. Written on the extension, not
   * on the base — `extends: ["checkout"]` on `applyCoupon` means "applying a
   * coupon sometimes extends checkout".
   */
  extends?: string[];
  /** Anything a reader needs: the precondition, the rule, the volume. */
  detail?: string;
  /** Artboard(s) that design this use case, for the coverage cross-check. */
  screenId?: string | string[];
}

export interface UseCaseOptions {
  font?: string;
  /** The label on the system boundary. Defaults to the diagram title. */
  system?: string;
  /** Use cases per column inside the boundary. Default 6. */
  perColumn?: number;
  policies?: Record<string, string | number>;
  dryRun?: boolean;
}

export interface UseCaseDiagramSpec {
  /** The compact line form — use this OR `actors`/`useCases`. */
  text?: string;
  title: string;
  subtitle?: string;
  parentId?: string;
  x?: number;
  y?: number;
  actors?: ActorSpec[];
  useCases?: UseCaseSpec[];
  options?: UseCaseOptions;
}

// ---- draw data ----

export interface DrawActor {
  id: string;
  /** Layer name: `actor:<id> · <label>`. */
  name: string;
  kind: ActorKind;
  at: Placement;
  label: string[];
  detail: string[];
  /** A system actor is a box; a person is a stick figure. */
  figure: "person" | "box";
  /** Where a line should meet this actor. */
  anchor: { x: number; y: number };
}

export interface DrawUseCase {
  id: string;
  /** Layer name: `usecase:<id> · <label>`. */
  name: string;
  at: Placement;
  label: string[];
  detail: string[];
  screenId?: string[];
  /** True when no actor reaches it — drawn amber so the page shows it. */
  orphan: boolean;
}

/** An association (actor ↔ use case) or a UML relationship between two ovals. */
export interface DrawLink {
  id: string;
  kind: "association" | "include" | "extend";
  /**
   * Two points: a straight line, not an elbow.
   *
   * Orthogonal routing is right for an activity diagram, where the arrow is a
   * route through a process. A use case association is a statement that two
   * things are related, and UML draws it straight. Elbowed associations make
   * the diagram look like a flowchart, which is exactly the misreading this
   * kind is shaped against.
   */
  points: Array<[number, number]>;
  color: string;
  dashed: boolean;
  /** «include» / «extend». Associations carry none. */
  stereotype?: string;
  /** Midpoint, where the stereotype label goes. */
  at?: { x: number; y: number };
}

export interface UseCaseDraw extends DrawFrameExtras {
  name: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
  h: number;
  parentId?: string;
  /** The system boundary rectangle. */
  boundary: Placement & { label: string };
  actors: DrawActor[];
  useCases: DrawUseCase[];
  links: DrawLink[];
  font: string;
}

export interface UseCaseBuild {
  draw: UseCaseDraw;
  model: UseCaseDiagramSpec;
  warnings: string[];
  stats: {
    actors: number;
    useCases: number;
    associations: number;
    /** Use cases nobody can start. The number that matters. */
    orphans: number;
    w: number;
    h: number;
  };
}
