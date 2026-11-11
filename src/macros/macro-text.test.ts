import { beforeEach, describe, expect, it } from "vitest";
import {
  charToKey,
  loadTextLayout,
  saveTextLayout,
  strokeToValue,
  textToValues,
  truncateToBytes,
  typableChars,
  utf8ByteLength,
  valueToChar,
  type TextLayout,
} from "./macro-text";

const PRINTABLE_ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i));
const SHIFT = 0x02000000;
const key = (id: number, shift = false) => (0x070000 | id | (shift ? SHIFT : 0)) >>> 0;

describe.each<TextLayout>(["jis", "us"])("%s layout table", (layout) => {
  it("types every printable ASCII character and reads each one back", () => {
    for (const ch of PRINTABLE_ASCII) {
      const k = charToKey(ch, layout);
      expect(k, `${layout} ${JSON.stringify(ch)}`).not.toBeNull();
      expect(valueToChar(strokeToValue(k!), layout), `${layout} ${JSON.stringify(ch)}`).toBe(ch);
    }
  });

  it("uses a different key (or shift state) for every character", () => {
    const strokes = PRINTABLE_ASCII.map((ch) => strokeToValue(charToKey(ch, layout)!));
    expect(new Set(strokes).size).toBe(PRINTABLE_ASCII.length);
    expect(typableChars(layout)).toHaveLength(PRINTABLE_ASCII.length);
  });

  it("only uses no modifier or Left Shift", () => {
    for (const ch of PRINTABLE_ASCII) {
      const flags = strokeToValue(charToKey(ch, layout)!) >>> 24;
      expect([0, 0x02]).toContain(flags);
    }
  });

  it("refuses Japanese, emoji and full-width characters", () => {
    for (const ch of ["あ", "漢", "😀", "Ａ", "、", "€"]) expect(charToKey(ch, layout)).toBeNull();
  });

  it("does not read a tap with Ctrl, or a media key, as a character", () => {
    expect(valueToChar((0x01000000 | 0x070006) >>> 0, layout)).toBeNull();
    expect(valueToChar(0x0c00e9, layout)).toBeNull();
    expect(valueToChar(key(0x28), layout)).toBeNull(); // Enter
  });
});

describe("JIS positions that differ from US", () => {
  it.each<[string, number, boolean]>([
    ["@", 0x2f, false],
    ["[", 0x30, false],
    ["]", 0x32, false],
    [":", 0x34, false],
    ["^", 0x2e, false],
    ["\\", 0x89, false],
    ["_", 0x87, true],
    ['"', 0x1f, true],
    ["'", 0x24, true],
    ["(", 0x25, true],
    [")", 0x26, true],
    ["&", 0x23, true],
    ["=", 0x2d, true],
    ["~", 0x2e, true],
    ["|", 0x89, true],
    ["`", 0x2f, true],
    ["{", 0x30, true],
    ["}", 0x32, true],
    ["*", 0x34, true],
    ["+", 0x33, true],
  ])("%s is %i (shift %s)", (ch, id, shift) => {
    expect(charToKey(ch, "jis")).toEqual({ id, shift });
  });

  it("matches the 日本語 tab's ¥ (137) and ろ (135) keys", () => {
    expect(charToKey("¥", "jis")).toEqual({ id: 137, shift: false });
    expect(charToKey("_", "jis")?.id).toBe(135);
    expect(charToKey("¥", "us")).toBeNull();
  });

  it("the same text needs different keys on JIS and US", () => {
    expect(textToValues("a@b", "jis").values).toEqual([key(4), key(0x2f), key(5)]);
    expect(textToValues("a@b", "us").values).toEqual([key(4), key(0x1f, true), key(5)]);
  });
});

describe("textToValues", () => {
  it("reports the positions of characters that cannot be typed, by code point", () => {
    const r = textToValues("a😀bあ", "jis");
    expect(r.values).toEqual([key(4), key(5)]);
    expect(r.invalid).toEqual([1, 3]);
  });
});

describe("name length in UTF-8 bytes", () => {
  it("counts ASCII as 1, Japanese as 3 and emoji as 4", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("メール")).toBe(9);
    expect(utf8ByteLength("😀")).toBe(4);
  });

  it("never cuts a multibyte character", () => {
    expect(truncateToBytes("あいう", 8)).toBe("あい");
    expect(truncateToBytes("ab😀", 5)).toBe("ab");
    expect(truncateToBytes("abcdef", 32)).toBe("abcdef");
    const cut = truncateToBytes("日本語の名前がとても長いマクロ", 32);
    expect(utf8ByteLength(cut)).toBeLessThanOrEqual(32);
    expect(cut).toBe("日本語の名前がとても");
  });
});

describe("layout preference", () => {
  const store = new Map<string, string>();
  const install = (value: unknown) =>
    Object.defineProperty(globalThis, "localStorage", { value, writable: true, configurable: true });

  beforeEach(() => {
    store.clear();
    install({
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });

  it("defaults to JIS and remembers the choice", () => {
    expect(loadTextLayout()).toBe("jis");
    saveTextLayout("us");
    expect(loadTextLayout()).toBe("us");
  });

  it("falls back to JIS when storage is blocked", () => {
    install({
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    expect(() => saveTextLayout("us")).not.toThrow();
    expect(loadTextLayout()).toBe("jis");
  });
});
