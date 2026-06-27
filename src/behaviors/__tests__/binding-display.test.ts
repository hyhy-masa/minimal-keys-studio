import { describe, it, expect } from "vitest";
import { formatBindingDetail } from "../binding-display";

describe("formatBindingDetail", () => {
  const layers = [
    { id: 0, index: 0, name: "Base" },
    { id: 1, index: 1, name: "Symbols" },
    { id: 2, index: 2, name: "Nav" },
  ];

  it("shows key name for Key Press", () => {
    // V = keyboard page 7, id 25 → usage = 0x70019
    const result = formatBindingDetail(
      "Key Press",
      { behaviorId: 1, param1: 0x70019, param2: 0 },
      layers,
    );
    expect(result).toBe("V");
  });

  it("shows layer + key for Layer-Tap", () => {
    // param1 = layer 1 (Symbols), param2 = Space (0x7002C)
    const result = formatBindingDetail(
      "Layer-Tap",
      { behaviorId: 2, param1: 1, param2: 0x7002C },
      layers,
    );
    expect(result).toBe("Symbols + スペース");
  });

  it("shows mouse button for Mouse Key Press", () => {
    const result = formatBindingDetail(
      "Mouse Key Press",
      { behaviorId: 3, param1: 1, param2: 0 },
      layers,
    );
    expect(result).toBe("左クリック");
  });

  it("shows modifier symbols + key for Mod-Tap", () => {
    // param1 = Ctrl (0x01), param2 = A (0x70004)
    const result = formatBindingDetail(
      "Mod-Tap",
      { behaviorId: 4, param1: 0x01, param2: 0x70004 },
      layers,
    );
    expect(result).toBe("⌃ + A");
  });

  it("shows layer name for Momentary Layer", () => {
    const result = formatBindingDetail(
      "Momentary Layer",
      { behaviorId: 5, param1: 1, param2: 0 },
      layers,
    );
    expect(result).toBe("Symbols");
  });

  it("shows modifier symbols for Sticky Key", () => {
    const result = formatBindingDetail(
      "Sticky Key",
      { behaviorId: 6, param1: 0x02, param2: 0 },
      layers,
    );
    expect(result).toBe("⇧");
  });

  it("returns empty string for None", () => {
    const result = formatBindingDetail(
      "None",
      { behaviorId: 7, param1: 0, param2: 0 },
      layers,
    );
    expect(result).toBe("");
  });

  it("returns empty string for Transparent", () => {
    const result = formatBindingDetail(
      "Transparent",
      { behaviorId: 8, param1: 0, param2: 0 },
      layers,
    );
    expect(result).toBe("");
  });

  it("falls back to layer index for unknown layer", () => {
    const result = formatBindingDetail(
      "Momentary Layer",
      { behaviorId: 5, param1: 99, param2: 0 },
      [],
    );
    expect(result).toBe("L99");
  });
});
