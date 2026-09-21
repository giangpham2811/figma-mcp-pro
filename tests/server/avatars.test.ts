import { describe, expect, it } from "vitest";
import { generateAvatar, AVATAR_STYLES } from "../../src/server/avatars.js";

describe("generateAvatar", () => {
  it("is deterministic by seed", () => {
    // The property the whole feature rests on. A random avatar makes a
    // redraw look like a content change, and a design review then spends
    // its time on the faces.
    const a = generateAvatar("Lan Nguyễn");
    const b = generateAvatar("Lan Nguyễn");
    expect(a.svg).toBe(b.svg);
    expect(generateAvatar("Minh").svg).not.toBe(a.svg);
  });

  it("defaults to initials rather than a face", () => {
    // A generated face reads as a specific person; initials read as the
    // placeholder they are.
    expect(generateAvatar("Lan").style).toBe("initials");
  });

  it("names the available styles when given one that does not exist", () => {
    expect(() => generateAvatar("Lan", { style: "nope" })).toThrow(/Unknown avatar style/);
    expect(() => generateAvatar("Lan", { style: "nope" })).toThrow(/initials/);
  });

  it("produces real SVG at the requested size for every style it advertises", () => {
    // A style in the list that throws is worse than one that is missing:
    // the caller picked it off a documented list.
    for (const style of AVATAR_STYLES) {
      const made = generateAvatar("Lan", { style, size: 48 });
      expect(made.svg.startsWith("<svg"), style).toBe(true);
      expect(made.svg, style).toContain('width="48"');
      expect(made.size, style).toBe(48);
    }
  });

  it("accepts a background colour with or without the hash", () => {
    const withHash = generateAvatar("Lan", { backgroundColor: ["#ff5500"] });
    const without = generateAvatar("Lan", { backgroundColor: ["ff5500"] });
    expect(withHash.svg).toBe(without.svg);
  });

  it("clamps an absurd size instead of generating it", () => {
    expect(generateAvatar("Lan", { size: 99_999 }).size).toBe(512);
    expect(generateAvatar("Lan", { size: 0 }).size).toBe(64);
  });
});
