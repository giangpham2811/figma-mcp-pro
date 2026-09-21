import { describe, expect, it } from "vitest";
import { checkPersonas } from "../../src/shared/persona/check.js";
import { checkJourney } from "../../src/shared/journey/check.js";
import { checkUseCases } from "../../src/shared/usecase/check.js";
import { parsePersonaText } from "../../src/shared/persona/text.js";
import { parseJourneyText } from "../../src/shared/journey/text.js";
import { parseUseCaseText } from "../../src/shared/usecase/text.js";
import { initialsOf } from "../../src/shared/persona/layout.js";

/**
 * A proof-reader is only worth having if it is SILENT when the model is
 * right. So every rule gets two tests: one that it fires, and one that it
 * does not fire on the honest case its exemption exists for. A checker with
 * only the first half is a checker that will be muted within a week, and a
 * muted checker catches nothing.
 */

const has = (warnings: string[], fragment: string): boolean =>
  warnings.some((w) => w.includes(fragment));

describe("persona checker", () => {
  it("reports a card that can settle no argument", () => {
    const { warnings } = checkPersonas([{ id: "a", name: "A", demographics: { Age: 30 } }]);
    expect(has(warnings, "no goals and no frustrations")).toBe(true);
  });

  it("reports the demographic persona", () => {
    const { warnings } = checkPersonas([
      { id: "a", goals: ["x"], frustrations: ["y"], demographics: { Age: 30, City: "HN" } },
    ]);
    expect(has(warnings, "demographic fields and no observed behaviour")).toBe(true);
  });

  it("is silent when demographics come WITH observed behaviour", () => {
    const { warnings } = checkPersonas([
      {
        id: "a",
        goals: ["x"],
        frustrations: ["y"],
        behaviours: ["retypes numbers into Excel"],
        demographics: { Age: 30, City: "HN" },
      },
    ]);
    expect(has(warnings, "demographic fields")).toBe(false);
  });

  it("spots two personas that are one person with two job titles", () => {
    const goals = [
      "close the books quickly",
      "avoid chasing people manually",
      "see who still owes money",
    ];
    const { warnings } = checkPersonas([
      { id: "a", role: "primary", goals, frustrations: ["x"] },
      { id: "b", goals: [...goals], frustrations: ["y"] },
    ]);
    expect(has(warnings, "the same things")).toBe(true);
  });

  it("does not cry wolf on two SHORT goal lists that happen to overlap", () => {
    // Under three goals, two lists overlap by accident. Firing here is how
    // the rule would get muted before it ever caught a real duplicate.
    const { warnings } = checkPersonas([
      { id: "a", role: "primary", goals: ["close the books"], frustrations: ["x"] },
      { id: "b", goals: ["close the books"], frustrations: ["y"] },
    ]);
    expect(has(warnings, "the same things")).toBe(false);
  });

  it("reports two primaries, and no primary at all", () => {
    const two = checkPersonas([
      { id: "a", role: "primary", goals: ["g"], frustrations: ["f"] },
      { id: "b", role: "primary", goals: ["h"], frustrations: ["f"] },
    ]);
    expect(has(two.warnings, "are marked primary")).toBe(true);

    const none = checkPersonas([
      { id: "a", goals: ["g"], frustrations: ["f"] },
      { id: "b", goals: ["h"], frustrations: ["f"] },
    ]);
    expect(has(none.warnings, 'role:"primary"')).toBe(true);
  });

  it("says nothing about a single persona having no primary", () => {
    // One card cannot be ambiguous about who it is for.
    const { warnings } = checkPersonas([{ id: "a", goals: ["g"], frustrations: ["f"] }]);
    expect(has(warnings, 'role:"primary"')).toBe(false);
  });

  it("builds initials that read correctly for both name orders", () => {
    expect(initialsOf("Nguyễn Văn An", "x")).toBe("NA");
    expect(initialsOf("Anna Schmidt", "x")).toBe("AS");
    expect(initialsOf("", "lan")).toBe("LA");
  });
});

describe("journey checker", () => {
  const stage = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    doing: ["does something"],
    touchpoints: ["a screen"],
    feeling: 0 as const,
    ...extra,
  });

  it("reports a stage nothing serves", () => {
    const { warnings } = checkJourney([stage("a"), stage("b", { touchpoints: [] })]);
    expect(has(warnings, "no touchpoint")).toBe(true);
  });

  it("reports a journey that only complains", () => {
    const { warnings } = checkJourney([stage("a", { pains: ["hurts"] }), stage("b")]);
    expect(has(warnings, "no answers")).toBe(true);
  });

  it("is silent once an opportunity answers the pain", () => {
    const { warnings } = checkJourney([
      stage("a", { pains: ["hurts"], opportunities: ["fix it"] }),
      stage("b"),
    ]);
    expect(has(warnings, "no answers")).toBe(false);
  });

  it("catches the table that was filled in rather than researched", () => {
    const flat = [stage("a"), stage("b"), stage("c"), stage("d")];
    const { warnings } = checkJourney(flat);
    expect(has(warnings, "flat emotion track")).toBe(true);
  });

  it("does not call three equal stages a flat track", () => {
    // Three stages at the same feeling is plausible; the rule needs enough
    // stages for flatness to be a claim about the research.
    const { warnings } = checkJourney([stage("a"), stage("b"), stage("c")]);
    expect(has(warnings, "flat emotion track")).toBe(false);
  });

  it("notices a journey with no low point", () => {
    const { warnings } = checkJourney([
      stage("a", { feeling: 1 }),
      stage("b", { feeling: 2 }),
      stage("c", { feeling: 1 }),
    ]);
    expect(has(warnings, "No stage feels negative")).toBe(true);
  });

  it("catches a pain on a stage that claims to feel good", () => {
    const { warnings } = checkJourney([stage("a", { feeling: 1, pains: ["hurts"], opportunities: ["fix"] })]);
    expect(has(warnings, "feels positive")).toBe(true);
  });

  it("clamps an out-of-range feeling instead of dropping the stage", () => {
    const { stages, warnings } = checkJourney([stage("a", { feeling: 9 })]);
    expect(stages[0]!.feeling).toBe(2);
    expect(has(warnings, "-2..2")).toBe(true);
  });
});

describe("use case checker", () => {
  it("reports a use case nobody can start", () => {
    const { warnings } = checkUseCases(
      [{ id: "u", kind: "primary" }],
      [
        { id: "a", actors: ["u"] },
        { id: "b" },
      ],
    );
    expect(has(warnings, "nobody can start it")).toBe(true);
  });

  it("is silent about an actorless use case that something INCLUDES", () => {
    // Factored-out common work is legitimately actorless: its actor is
    // whoever started the including use case. Without this exemption the
    // rule fires on every well-factored diagram.
    const { warnings } = checkUseCases(
      [{ id: "u" }],
      [
        { id: "a", actors: ["u"], includes: ["b"] },
        { id: "b" },
      ],
    );
    expect(has(warnings, "nobody can start it")).toBe(false);
  });

  it("DROPS an actor-to-actor link rather than drawing it", () => {
    // A drawn line is a claim, and a plain line between two actors asserts a
    // relationship UML gives no meaning to.
    const actors = [{ id: "a", actors: ["b"] }, { id: "b" }] as never[];
    const { actors: out, warnings } = checkUseCases(actors, [{ id: "u", actors: ["a"] }]);
    expect(has(warnings, "was NOT drawn")).toBe(true);
    expect((out[0] as { actors?: string[] }).actors).toBeUndefined();
  });

  it("explains a use case id written where an actor was expected", () => {
    const { warnings } = checkUseCases(
      [{ id: "u" }],
      [
        { id: "a", actors: ["b"] },
        { id: "b", actors: ["u"] },
      ],
    );
    expect(has(warnings, "is another USE CASE")).toBe(true);
  });

  it("finds an include cycle", () => {
    const { warnings } = checkUseCases(
      [{ id: "u" }],
      [
        { id: "a", actors: ["u"], includes: ["b"] },
        { id: "b", includes: ["a"] },
      ],
    );
    expect(has(warnings, "Include cycle")).toBe(true);
  });

  it("reports an actor who does nothing", () => {
    const { warnings } = checkUseCases(
      [{ id: "u" }, { id: "idle" }],
      [{ id: "a", actors: ["u"] }],
    );
    expect(has(warnings, '"idle" takes part in no use case')).toBe(true);
  });
});

describe("the compact text forms", () => {
  it("reads a persona block, roles and all", () => {
    const { personas, warnings } = parsePersonaText(`
persona lan "Lan Nguyễn" | Kế toán trưởng | primary
  quote: Tôi chỉ muốn biết ai còn nợ ai.
  goal: Chốt sổ trong một buổi
  pain: Ảnh hoá đơn mỗi người một kiểu
  tool: Excel, Zalo
  about: Tuổi = 34
`);
    expect(warnings).toEqual([]);
    const p = personas[0]!;
    expect(p.name).toBe("Lan Nguyễn");
    expect(p.title).toBe("Kế toán trưởng");
    expect(p.role).toBe("primary");
    // tools split on commas; goals do not, because a goal can contain one.
    expect(p.tools).toEqual(["Excel", "Zalo"]);
    expect(p.goals).toEqual(["Chốt sổ trong một buổi"]);
    expect(p.demographics).toEqual({ "Tuổi": "34" });
  });

  it("reads a journey stage with a worded feeling", () => {
    const { stages, warnings } = parseJourneyText(`
stage chia "Chia tiền"  feeling: frustrated
  does: Chụp ảnh hoá đơn
  pain: Không nhớ ai đã chuyển
`);
    expect(warnings).toEqual([]);
    expect(stages[0]!.feeling).toBe(-1);
    expect(stages[0]!.label).toBe("Chia tiền");
  });

  it("does not let a `by:` after an actor line attach to the use case above", () => {
    // The silent-wrong-answer case: without the block reset, `by:` would
    // land on `chia` and the diagram would claim the wrong actor.
    const { useCases, warnings } = parseUseCaseText(`
uc chia "Chia tiền"
actor lan "Lan" primary
  by: lan
`);
    expect(useCases[0]!.actors ?? []).toEqual([]);
    expect(has(warnings, "nothing to attach it to")).toBe(true);
  });

  it("reports a line it does not understand instead of dropping it", () => {
    const { warnings } = parseJourneyText("this is not a stage line");
    expect(has(warnings, "not understood")).toBe(true);
  });
});
