/**
 * How a macro key reads on the keymap, in the picker and in the combo list.
 */
import type { UserOS } from "../behaviors/use-cases";
import { comboShortcutLabel } from "../combos/combo-shortcut";
import * as Macros from "../proto/macros";
import type { StoredMacro } from "./macro-client";
import { stepsToRows, slotLabel, type MacroRow } from "./macro-model";
import type { TextLayout } from "./macro-text";

/** The macro behavior, when the firmware has one. */
export function findMacroBehavior<T extends { displayName: string }>(behaviors: T[]): T | undefined {
  return behaviors.find((b) => b.displayName === Macros.MACRO_BEHAVIOR_NAME);
}

export function findMacro(macros: StoredMacro[], index: number): StoredMacro | undefined {
  return macros.find((m) => m.index === index);
}

/** "M1 メールアドレス", or "M1" when the name is unknown or empty. */
export function macroBindingLabel(index: number, macros: StoredMacro[]): string {
  const name = findMacro(macros, index)?.name;
  return name ? `${slotLabel(index)} ${name}` : slotLabel(index);
}

const TEXT_PREVIEW_CHARS = 20;

export function rowLabel(row: MacroRow, os: UserOS): string {
  switch (row.kind) {
    case "text": {
      const chars = Array.from(row.text);
      const shown = chars.length > TEXT_PREVIEW_CHARS ? `${chars.slice(0, TEXT_PREVIEW_CHARS).join("")}…` : row.text;
      return `文字「${shown}」`;
    }
    case "key":
      return row.value ? comboShortcutLabel(row.value, os) : "キー未選択";
    case "wait":
      return `${row.ms}ms 待つ`;
    case "raw":
      return `${row.type === Macros.STEP_PRESS ? "押したまま" : row.type === Macros.STEP_RELEASE ? "離す" : "そのほか"} ${comboShortcutLabel(row.value, os)}`;
  }
}

const SUMMARY_ROWS = 4;

/** A short description of what a macro does, with key names for the chosen OS. */
export function macroSummary(macro: StoredMacro, os: UserOS, layout: TextLayout): string {
  const rows = stepsToRows(macro.steps, layout);
  if (rows.length === 0) return "手順がありません。";
  const parts = rows.slice(0, SUMMARY_ROWS).map((r) => rowLabel(r, os));
  return `${parts.join(" → ")}${rows.length > SUMMARY_ROWS ? " → …" : ""}`;
}

/** The keymap tooltip for a macro key: slot and name, then what it types. */
export function macroTooltipData(
  index: number,
  macros: StoredMacro[],
  os: UserOS,
  layout: TextLayout,
): { type: "detail"; roleName: string; description: string } {
  const macro = findMacro(macros, index);
  return {
    type: "detail",
    roleName: macroBindingLabel(index, macros),
    description: macro
      ? macroSummary(macro, os, layout)
      : "このマクロの中身は読み込めていません。「マクロ」タブで確かめてください。",
  };
}
