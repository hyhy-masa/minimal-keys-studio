/**
 * Text <-> key conversion for macro 「文字」 rows.
 *
 * The keyboard only sends key positions (HID usages). Which character a
 * position types is decided by the PC's keyboard layout, so the same text
 * needs different keys on a Japanese (JIS) and an English (US) layout.
 */
import { hid_usage_from_page_and_id, hid_usage_page_and_id_from_usage } from "../hid-usages";
import { withModifiers } from "../combos/combo-shortcut";

export type TextLayout = "jis" | "us";

export interface KeyStroke {
  /** HID usage id on the keyboard page (7). */
  id: number;
  shift: boolean;
}

const KEYBOARD_PAGE = 7;
const LEFT_SHIFT = 0x02;

// Keys the two layouts share, unshifted.
const COMMON_PLAIN: [string, number][] = [
  ...Array.from({ length: 26 }, (_, i): [string, number] => [String.fromCharCode(97 + i), 4 + i]),
  ...Array.from({ length: 9 }, (_, i): [string, number] => [String(i + 1), 30 + i]),
  ["0", 39],
  [" ", 44],
  ["-", 45],
  [",", 54],
  [".", 55],
  ["/", 56],
];

const COMMON_SHIFT: [string, number][] = [
  ...Array.from({ length: 26 }, (_, i): [string, number] => [String.fromCharCode(65 + i), 4 + i]),
  ["!", 30],
  ["#", 32],
  ["$", 33],
  ["%", 34],
  ["<", 54],
  [">", 55],
  ["?", 56],
];

const US_PLAIN: [string, number][] = [
  ["=", 46],
  ["[", 47],
  ["]", 48],
  ["\\", 49],
  [";", 51],
  ["'", 52],
  ["`", 53],
];

const US_SHIFT: [string, number][] = [
  ["@", 31],
  ["^", 35],
  ["&", 36],
  ["*", 37],
  ["(", 38],
  [")", 39],
  ["_", 45],
  ["+", 46],
  ["{", 47],
  ["}", 48],
  ["|", 49],
  [":", 51],
  ['"', 52],
  ["~", 53],
];

// JIS positions, cross-checked with the picker's 日本語 tab (¥ = 137, ろ = 135).
const JIS_YEN = 0x89; // International3: ¥ key (types \ on Windows)
const JIS_RO = 0x87; // International1: ろ key

const JIS_PLAIN: [string, number][] = [
  ["^", 0x2e],
  ["@", 0x2f],
  ["[", 0x30],
  ["]", 0x32],
  [";", 0x33],
  [":", 0x34],
  ["\\", JIS_YEN],
];

const JIS_SHIFT: [string, number][] = [
  ['"', 31],
  ["&", 35],
  ["'", 36],
  ["(", 37],
  [")", 38],
  ["=", 0x2d],
  ["~", 0x2e],
  ["`", 0x2f],
  ["{", 0x30],
  ["}", 0x32],
  ["+", 0x33],
  ["*", 0x34],
  ["|", JIS_YEN],
  ["_", JIS_RO],
];

function buildTable(plain: [string, number][], shift: [string, number][]): Map<string, KeyStroke> {
  const table = new Map<string, KeyStroke>();
  for (const [ch, id] of plain) table.set(ch, { id, shift: false });
  for (const [ch, id] of shift) table.set(ch, { id, shift: true });
  return table;
}

const TABLES: Record<TextLayout, Map<string, KeyStroke>> = {
  us: buildTable([...COMMON_PLAIN, ...US_PLAIN], [...COMMON_SHIFT, ...US_SHIFT]),
  jis: buildTable([...COMMON_PLAIN, ...JIS_PLAIN], [...COMMON_SHIFT, ...JIS_SHIFT]),
};

// Reverse lookup: "<id>:<shift>" -> character.
const REVERSE: Record<TextLayout, Map<string, string>> = {
  us: new Map([...TABLES.us].map(([ch, k]) => [`${k.id}:${k.shift}`, ch])),
  jis: new Map([...TABLES.jis].map(([ch, k]) => [`${k.id}:${k.shift}`, ch])),
};

/** The key for one character, or null when the layout cannot type it. */
export function charToKey(ch: string, layout: TextLayout): KeyStroke | null {
  // ¥ is the same key as \ on a JIS layout.
  if (layout === "jis" && ch === "¥") return { id: JIS_YEN, shift: false };
  return TABLES[layout].get(ch) ?? null;
}

/** The Key Press param1 (HID usage with Left Shift when needed) for a stroke. */
export function strokeToValue(k: KeyStroke): number {
  return withModifiers(hid_usage_from_page_and_id(KEYBOARD_PAGE, k.id), k.shift ? LEFT_SHIFT : 0);
}

/**
 * The character a tap value types, or null. Only plain keys on the keyboard
 * page with no modifier or Left Shift alone count as characters.
 */
export function valueToChar(value: number, layout: TextLayout): string | null {
  const flags = (value >>> 24) & 0xff;
  if (flags !== 0 && flags !== LEFT_SHIFT) return null;
  const [rawPage, id] = hid_usage_page_and_id_from_usage(value);
  if ((rawPage & 0xff) !== KEYBOARD_PAGE) return null;
  return REVERSE[layout].get(`${id}:${flags === LEFT_SHIFT}`) ?? null;
}

export interface TextConversion {
  values: number[];
  /** Indices (in code points) of characters the layout cannot type. */
  invalid: number[];
}

/** Converts text to tap values, one per character (by code point, so emoji count once). */
export function textToValues(text: string, layout: TextLayout): TextConversion {
  const values: number[] = [];
  const invalid: number[] = [];
  Array.from(text).forEach((ch, i) => {
    const k = charToKey(ch, layout);
    if (k) values.push(strokeToValue(k));
    else invalid.push(i);
  });
  return { values, invalid };
}

/** Every character the layout can type, in table order (for tests and hints). */
export function typableChars(layout: TextLayout): string[] {
  return [...TABLES[layout].keys()];
}

// --- Name length ---

const encoder = new TextEncoder();

export function utf8ByteLength(s: string): number {
  return encoder.encode(s).length;
}

/** Cuts `s` to at most `maxBytes` UTF-8 bytes without splitting a character. */
export function truncateToBytes(s: string, maxBytes: number): string {
  if (utf8ByteLength(s) <= maxBytes) return s;
  let out = "";
  let bytes = 0;
  for (const ch of s) {
    const n = utf8ByteLength(ch);
    if (bytes + n > maxBytes) break;
    out += ch;
    bytes += n;
  }
  return out;
}

// --- Layout preference (per PC, so it lives in this browser only) ---

const LAYOUT_KEY = "macroTextLayout";

export function loadTextLayout(): TextLayout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === "us" ? "us" : "jis";
  } catch {
    return "jis";
  }
}

export function saveTextLayout(layout: TextLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Storage can be blocked; the choice then lasts for this session only.
  }
}
