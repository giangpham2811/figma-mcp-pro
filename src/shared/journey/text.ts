/**
 * The compact text form for journey maps.
 *
 *   stage chia "Chia tiền sau bữa ăn"  feeling: -1
 *     does: Chụp ảnh hoá đơn
 *     does: Nhẩm chia theo đầu người
 *     touch: Ảnh trong Zalo
 *     thinks: Ai trả rồi, ai chưa?
 *     pain: Không nhớ ai đã chuyển khoản
 *     opp: Tự động đối soát khi có biến động số dư
 *
 * `feeling` rides on the stage line because it is one token and belongs with
 * the stage, not below it. Everything else is a child line, so a stage can be
 * scanned vertically.
 */
import { lines, takeQuoted, unknownLine } from "../diagram/text-util.js";
import type { StageSpec, Feeling } from "./types.js";

export interface JourneyTextParse {
  stages: StageSpec[];
  warnings: string[];
}

const LIST_FIELDS: Record<
  string,
  "doing" | "touchpoints" | "thinking" | "pains" | "opportunities"
> = {
  does: "doing",
  do: "doing",
  doing: "doing",
  action: "doing",
  touch: "touchpoints",
  touchpoint: "touchpoints",
  touchpoints: "touchpoints",
  thinks: "thinking",
  think: "thinking",
  thinking: "thinking",
  pain: "pains",
  pains: "pains",
  opp: "opportunities",
  opportunity: "opportunities",
  opportunities: "opportunities",
};

/** Words people write instead of a number. */
const WORD_FEELING: Record<string, Feeling> = {
  despair: -2,
  awful: -2,
  angry: -2,
  frustrated: -1,
  annoyed: -1,
  bad: -1,
  neutral: 0,
  ok: 0,
  fine: 0,
  pleased: 1,
  good: 1,
  happy: 1,
  delighted: 2,
  great: 2,
};

function readFeeling(raw: string, warnings: string[], lineNo: number): Feeling | undefined {
  const t = raw.trim().toLowerCase();
  if (!t) return undefined;
  if (t in WORD_FEELING) return WORD_FEELING[t];
  const n = Number(t);
  if (Number.isFinite(n)) {
    const clamped = Math.max(-2, Math.min(2, Math.round(n))) as Feeling;
    if (clamped !== n) {
      warnings.push(
        `journey text, line ${lineNo}: feeling ${raw} is outside the -2..2 scale; read as ${clamped}.`,
      );
    }
    return clamped;
  }
  warnings.push(
    `journey text, line ${lineNo}: feeling "${raw}" is not a number in -2..2 nor one of ${Object.keys(WORD_FEELING).join("/")}; ignored.`,
  );
  return undefined;
}

export function parseJourneyText(src: string): JourneyTextParse {
  const warnings: string[] = [];
  const stages: StageSpec[] = [];
  let current: StageSpec | null = null;

  for (const l of lines(src)) {
    const head = /^stage\s+(\S+)\s*(.*)$/i.exec(l.text);
    if (head) {
      const id = head[1]!;
      let rest = head[2] ?? "";

      // feeling can appear anywhere on the line: pull it out before the label.
      let feeling: Feeling | undefined;
      const feel = /\bfeel(?:ing)?\s*[:=]\s*(-?\w+)/i.exec(rest);
      if (feel) {
        feeling = readFeeling(feel[1]!, warnings, l.no);
        rest = (rest.slice(0, feel.index) + rest.slice(feel.index + feel[0].length)).trim();
      }

      const quoted = takeQuoted(rest);
      const label = quoted.value ?? quoted.rest.trim();
      current = {
        id,
        ...(label ? { label } : {}),
        ...(feeling !== undefined ? { feeling } : {}),
      };
      stages.push(current);
      continue;
    }

    const field = /^(\w+)\s*:\s*(.+)$/.exec(l.text);
    if (field && current) {
      const key = field[1]!.toLowerCase();
      const value = field[2]!.trim();

      const listKey = LIST_FIELDS[key];
      if (listKey) {
        current[listKey] = [...(current[listKey] ?? []), value];
        continue;
      }
      if (key === "feeling" || key === "feel") {
        const f = readFeeling(value, warnings, l.no);
        if (f !== undefined) current.feeling = f;
        continue;
      }
      if (key === "screen" || key === "screenid") {
        current.screenId = value.split(",").map((v) => v.trim()).filter(Boolean);
        continue;
      }
    }

    if (field && !current) {
      warnings.push(
        `journey text, line ${l.no}: "${l.text}" comes before any \`stage\` line, so there is nothing to attach it to.`,
      );
      continue;
    }
    unknownLine(warnings, "journey", l);
  }

  return { stages, warnings };
}
