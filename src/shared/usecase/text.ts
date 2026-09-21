/**
 * The compact text form for use case diagrams.
 *
 *   actor nguoi_chia "Người chia tiền"   primary
 *   actor ngan_hang  "Ngân hàng"         system
 *
 *   uc chia "Chia tiền bữa ăn"
 *     by: nguoi_chia
 *     includes: tinh_no
 *     detail: Chia đều hoặc theo phần
 *   uc tinh_no "Tính ai nợ ai"
 *   uc nhac_no "Nhắc người chưa trả"
 *     by: nguoi_chia
 *     extends: chia
 *
 * `by:` rather than `actors:` because it reads as the sentence the diagram
 * makes — "chia, by người chia tiền" — and because `actors` next to an
 * `actor` line invites writing the actor's NAME there instead of its id.
 */
import { lines, takeQuoted, unknownLine } from "../diagram/text-util.js";
import type { ActorSpec, UseCaseSpec, ActorKind } from "./types.js";

export interface UseCaseTextParse {
  actors: ActorSpec[];
  useCases: UseCaseSpec[];
  warnings: string[];
}

const KINDS: ActorKind[] = ["primary", "secondary", "system"];

function splitIds(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseUseCaseText(src: string): UseCaseTextParse {
  const warnings: string[] = [];
  const actors: ActorSpec[] = [];
  const useCases: UseCaseSpec[] = [];
  let current: UseCaseSpec | null = null;

  for (const l of lines(src)) {
    const actor = /^actor\s+(\S+)\s*(.*)$/i.exec(l.text);
    if (actor) {
      const id = actor[1]!;
      let rest = actor[2] ?? "";
      const quoted = takeQuoted(rest);
      rest = quoted.rest;

      let kind: ActorKind | undefined;
      const words: string[] = [];
      for (const w of rest.split(/\s+/).filter(Boolean)) {
        const lower = w.toLowerCase();
        if ((KINDS as string[]).includes(lower)) kind = lower as ActorKind;
        else words.push(w);
      }
      actors.push({
        id,
        ...(quoted.value ? { label: quoted.value } : words.length ? { label: words.join(" ") } : {}),
        ...(kind ? { kind } : {}),
      });
      // An actor line ends any use case block: `by:` after it would otherwise
      // attach to the use case above, which is a silent wrong answer.
      current = null;
      continue;
    }

    const uc = /^(?:uc|usecase|use case)\s+(\S+)\s*(.*)$/i.exec(l.text);
    if (uc) {
      const id = uc[1]!;
      const quoted = takeQuoted(uc[2] ?? "");
      const label = quoted.value ?? quoted.rest.trim();
      current = { id, ...(label ? { label } : {}) };
      useCases.push(current);
      continue;
    }

    const field = /^(\w+)\s*:\s*(.+)$/.exec(l.text);
    if (field && current) {
      const key = field[1]!.toLowerCase();
      const value = field[2]!.trim();
      if (key === "by" || key === "actor" || key === "actors") {
        current.actors = [...(current.actors ?? []), ...splitIds(value)];
        continue;
      }
      if (key === "include" || key === "includes") {
        current.includes = [...(current.includes ?? []), ...splitIds(value)];
        continue;
      }
      if (key === "extend" || key === "extends") {
        current.extends = [...(current.extends ?? []), ...splitIds(value)];
        continue;
      }
      if (key === "detail" || key === "note") {
        current.detail = current.detail ? `${current.detail} ${value}` : value;
        continue;
      }
      if (key === "screen" || key === "screenid") {
        current.screenId = splitIds(value);
        continue;
      }
    }

    if (field && !current) {
      warnings.push(
        `usecase text, line ${l.no}: "${l.text}" comes after an \`actor\` line or before any \`uc\` line, so there is nothing to attach it to.`,
      );
      continue;
    }
    unknownLine(warnings, "usecase", l);
  }

  return { actors, useCases, warnings };
}
