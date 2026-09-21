/**
 * The compact text form for personas.
 *
 *   persona lan "Lan Nguyễn" | Kế toán trưởng | primary
 *     quote: Tôi chỉ muốn biết cuối tháng ai còn nợ ai.
 *     goal: Chốt sổ trong một buổi tối
 *     pain: Mỗi người gửi một kiểu ảnh chụp hoá đơn
 *     does: Gõ lại số tiền vào Excel của riêng mình
 *     tool: Excel, Zalo
 *     about: Tuổi = 34
 *     scenario: Cuối tháng, sau giờ làm, trên điện thoại
 *
 * House rule from the other front ends: a line that is not understood is
 * REPORTED, never dropped. A persona that quietly lost its goals is worse
 * than one that failed to parse, because the checker downstream would then
 * report the missing goals as a research problem.
 */
import { lines, takeQuoted, unknownLine } from "../diagram/text-util.js";
import type { PersonaSpec, PersonaRole } from "./types.js";

export interface PersonaTextParse {
  personas: PersonaSpec[];
  warnings: string[];
}

const ROLES: PersonaRole[] = ["primary", "secondary", "served", "negative"];

/** Field keyword → where it lands. Aliases because people type what they mean. */
const LIST_FIELDS: Record<string, "goals" | "frustrations" | "behaviours" | "tools"> = {
  goal: "goals",
  goals: "goals",
  pain: "frustrations",
  pains: "frustrations",
  frustration: "frustrations",
  frustrations: "frustrations",
  does: "behaviours",
  behaviour: "behaviours",
  behavior: "behaviours",
  behaviours: "behaviours",
  behaviors: "behaviours",
  tool: "tools",
  tools: "tools",
};

export function parsePersonaText(src: string): PersonaTextParse {
  const warnings: string[] = [];
  const personas: PersonaSpec[] = [];
  let current: PersonaSpec | null = null;

  for (const l of lines(src)) {
    const head = /^persona\s+(\S+)\s*(.*)$/i.exec(l.text);
    if (head) {
      const id = head[1]!;
      let rest = head[2] ?? "";
      const quoted = takeQuoted(rest);
      rest = quoted.rest;

      // "Name | Title | role" — the pipes are optional and positional.
      const parts = rest
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      let role: PersonaRole | undefined;
      const kept: string[] = [];
      for (const part of parts) {
        const lower = part.toLowerCase();
        if ((ROLES as string[]).includes(lower)) role = lower as PersonaRole;
        else if (lower === "not for" || lower === "anti") role = "negative";
        else kept.push(part);
      }

      current = {
        id,
        ...(quoted.value ? { name: quoted.value } : kept.length ? { name: kept.shift()! } : {}),
        ...(kept.length ? { title: kept.join(" · ") } : {}),
        ...(role ? { role } : {}),
      };
      personas.push(current);
      continue;
    }

    const field = /^(\w+)\s*:\s*(.+)$/.exec(l.text);
    if (field && current) {
      const key = field[1]!.toLowerCase();
      const value = field[2]!.trim();

      const listKey = LIST_FIELDS[key];
      if (listKey) {
        // "tool: Excel, Zalo" is two tools; "goal: Chốt sổ, không sai số" is
        // ONE goal that happens to have a comma. Splitting is therefore only
        // done for the fields where a list on one line is the normal way to
        // write it.
        const values =
          listKey === "tools" ? value.split(",").map((v) => v.trim()).filter(Boolean) : [value];
        current[listKey] = [...(current[listKey] ?? []), ...values];
        continue;
      }
      if (key === "quote") {
        current.quote = value.replace(/^["“]|["”]$/g, "");
        continue;
      }
      if (key === "scenario") {
        current.scenario = value;
        continue;
      }
      if (key === "about" || key === "demo" || key === "demographic") {
        // `about: Tuổi = 34` or `about: Tuổi: 34` — both read the same.
        const pair = /^(.+?)\s*[=:]\s*(.+)$/.exec(value);
        if (!pair) {
          warnings.push(
            `persona text, line ${l.no}: \`about\` needs "field = value" — got "${value}".`,
          );
          continue;
        }
        current.demographics = { ...(current.demographics ?? {}), [pair[1]!.trim()]: pair[2]!.trim() };
        continue;
      }
      if (key === "screen" || key === "screenid") {
        current.screenId = value.split(",").map((v) => v.trim()).filter(Boolean);
        continue;
      }
    }

    if (field && !current) {
      warnings.push(
        `persona text, line ${l.no}: "${l.text}" comes before any \`persona\` line, so there is nothing to attach it to.`,
      );
      continue;
    }
    unknownLine(warnings, "persona", l);
  }

  return { personas, warnings };
}
