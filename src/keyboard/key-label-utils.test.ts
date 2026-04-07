import { describe, it, expect } from "vitest";
import { modifierSymbols } from "./key-label-utils";

describe("modifierSymbols", () => {
  it("converts Ctrl bitmask to ⌃", () => {
    expect(modifierSymbols(0x01)).toBe("⌃");
  });
  it("converts Shift bitmask to ⇧", () => {
    expect(modifierSymbols(0x02)).toBe("⇧");
  });
  it("converts Alt bitmask to ⌥", () => {
    expect(modifierSymbols(0x04)).toBe("⌥");
  });
  it("converts Cmd bitmask to ⌘", () => {
    expect(modifierSymbols(0x08)).toBe("⌘");
  });
  it("converts Ctrl+Shift to ⌃⇧", () => {
    expect(modifierSymbols(0x03)).toBe("⌃⇧");
  });
  it("converts all modifiers to ⌃⇧⌥⌘", () => {
    expect(modifierSymbols(0x0f)).toBe("⌃⇧⌥⌘");
  });
  it("converts Right Ctrl to R⌃", () => {
    expect(modifierSymbols(0x10)).toBe("R⌃");
  });
  it("converts Right Shift to R⇧", () => {
    expect(modifierSymbols(0x20)).toBe("R⇧");
  });
  it("converts Right Cmd to R⌘", () => {
    expect(modifierSymbols(0x80)).toBe("R⌘");
  });
  it("converts all right modifiers", () => {
    expect(modifierSymbols(0xf0)).toBe("R⌃R⇧R⌥R⌘");
  });
  it("falls back for unknown bitmask 0", () => {
    expect(modifierSymbols(0)).toBe("Mod0");
  });
});
