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
  it("falls back for unknown bitmask 0", () => {
    expect(modifierSymbols(0)).toBe("Mod0");
  });
});
