/**
 * The macro editor's rows and how they map to firmware steps.
 */
import * as Macros from "../proto/macros";
import type { TextLayout } from "./macro-text";
import { textToValues, valueToChar } from "./macro-text";

export type MacroRow =
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "key"; value: number }
  | { id: string; kind: "wait"; ms: number }
  // press / release are not made by this screen; they are kept as they are.
  | { id: string; kind: "raw"; type: number; value: number };

let rowSeq = 0;
export function newRowId(): string {
  rowSeq += 1;
  return `row-${rowSeq}`;
}

export interface Speed {
  id: "normal" | "slow" | "slower";
  label: string;
  tapMs: number;
  waitMs: number;
}

export const SPEEDS: Speed[] = [
  { id: "normal", label: "ふつう", tapMs: 30, waitMs: 40 },
  { id: "slow", label: "ゆっくり", tapMs: 60, waitMs: 80 },
  { id: "slower", label: "とてもゆっくり", tapMs: 100, waitMs: 150 },
];

export function speedOf(tapMs: number, waitMs: number): Speed | null {
  return SPEEDS.find((s) => s.tapMs === tapMs && s.waitMs === waitMs) ?? null;
}

export const WAIT_PRESETS_MS = [100, 300, 500, 1000];

/**
 * Turns stored steps into rows. Consecutive taps that type a character in the
 * chosen layout become one 「文字」 row; other taps become 「キー」 rows.
 */
export function stepsToRows(steps: Macros.Step[], layout: TextLayout): MacroRow[] {
  const rows: MacroRow[] = [];
  for (const step of steps) {
    if (step.type === Macros.STEP_TAP) {
      const ch = valueToChar(step.value, layout);
      const last = rows[rows.length - 1];
      if (ch !== null) {
        if (last?.kind === "text") last.text += ch;
        else rows.push({ id: newRowId(), kind: "text", text: ch });
      } else {
        rows.push({ id: newRowId(), kind: "key", value: step.value >>> 0 });
      }
    } else if (step.type === Macros.STEP_WAIT) {
      rows.push({ id: newRowId(), kind: "wait", ms: step.value });
    } else {
      rows.push({ id: newRowId(), kind: "raw", type: step.type, value: step.value >>> 0 });
    }
  }
  return rows;
}

export interface RowsConversion {
  steps: Macros.Step[];
  /** Row id -> indices of characters that cannot be typed. */
  invalidChars: Map<string, number[]>;
}

/** Turns rows into steps. Characters that cannot be typed are left out and reported. */
export function rowsToSteps(rows: MacroRow[], layout: TextLayout): RowsConversion {
  const steps: Macros.Step[] = [];
  const invalidChars = new Map<string, number[]>();
  for (const row of rows) {
    switch (row.kind) {
      case "text": {
        const { values, invalid } = textToValues(row.text, layout);
        for (const value of values) steps.push({ type: Macros.STEP_TAP, value });
        if (invalid.length) invalidChars.set(row.id, invalid);
        break;
      }
      case "key":
        if (row.value) steps.push({ type: Macros.STEP_TAP, value: row.value >>> 0 });
        break;
      case "wait":
        steps.push({ type: Macros.STEP_WAIT, value: row.ms });
        break;
      case "raw":
        steps.push({ type: row.type, value: row.value });
        break;
    }
  }
  return { steps, invalidChars };
}

/** Playback time in ms: a tap holds tapMs then waits waitMs; a wait step waits its own value. */
export function estimateMs(steps: Macros.Step[], tapMs: number, waitMs: number): number {
  let total = 0;
  for (const s of steps) {
    if (s.type === Macros.STEP_TAP) total += tapMs + waitMs;
    else if (s.type === Macros.STEP_WAIT) total += s.value;
    else total += waitMs;
  }
  return total;
}

/** "約 2.2 秒" style seconds with one decimal. */
export function formatSeconds(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1);
}

/** The first slot without a macro, or null when every slot is used. */
export function firstFreeSlot(maxMacros: number, used: number[]): number | null {
  const set = new Set(used);
  for (let i = 0; i < maxMacros; i++) if (!set.has(i)) return i;
  return null;
}

/** Customers see slots as M1, M2…; the firmware counts from 0. */
export function slotLabel(index: number): string {
  return `M${index + 1}`;
}

export function clampWaitStep(ms: number): number {
  if (!Number.isFinite(ms)) return Macros.MIN_WAIT_STEP_MS;
  return Math.min(Macros.MAX_WAIT_STEP_MS, Math.max(Macros.MIN_WAIT_STEP_MS, Math.round(ms)));
}
