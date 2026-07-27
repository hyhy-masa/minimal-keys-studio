import { describe, expect, it } from "vitest";
import { calculateImportChanges } from "./import-diff";

const binding = (behaviorId: number, param1 = 0, param2 = 0) => ({
  behaviorId,
  param1,
  param2,
});

const currentKeymap = {
  layers: [
    { id: 10, name: "Base", bindings: [binding(1), binding(2, 7)] },
    { id: 11, name: "Symbols", bindings: [binding(3), binding(4)] },
  ],
};

describe("calculateImportChanges", () => {
  it("returns no writes for an identical keymap", () => {
    const result = calculateImportChanges(currentKeymap, [
      { name: "Base", bindings: [binding(1), binding(2, 7)] },
      { name: "Symbols", bindings: [binding(3), binding(4)] },
    ]);

    expect(result).toEqual({ layerProps: [], bindings: [] });
  });

  it("returns only the changed key binding", () => {
    const result = calculateImportChanges(currentKeymap, [
      { name: "Base", bindings: [binding(1), binding(9, 7)] },
      { name: "Symbols", bindings: [binding(3), binding(4)] },
    ]);

    expect(result).toEqual({
      layerProps: [],
      bindings: [{ layerId: 10, keyPosition: 1, binding: binding(9, 7) }],
    });
  });

  it("returns only the layer name update when bindings are unchanged", () => {
    const result = calculateImportChanges(currentKeymap, [
      { name: "Main", bindings: [binding(1), binding(2, 7)] },
      { name: "Symbols", bindings: [binding(3), binding(4)] },
    ]);

    expect(result).toEqual({
      layerProps: [{ layerId: 10, name: "Main" }],
      bindings: [],
    });
  });

  it("keeps the existing behavior for imported layer counts that differ from the current keymap", () => {
    const moreImported = calculateImportChanges(currentKeymap, [
      { name: "Base", bindings: [binding(1), binding(2, 7)] },
      { name: "Symbols", bindings: [binding(3), binding(4)] },
      { name: "Extra", bindings: [binding(8), binding(8)] },
    ]);
    const fewerImported = calculateImportChanges(currentKeymap, [
      { name: "Base", bindings: [binding(1), binding(2, 7)] },
    ]);

    expect(moreImported).toEqual({ layerProps: [], bindings: [] });
    expect(fewerImported).toEqual({ layerProps: [], bindings: [] });
  });

  it("detects parameter changes even when behaviorId is the same", () => {
    const result = calculateImportChanges(currentKeymap, [
      { name: "Base", bindings: [binding(1), binding(2, 8)] },
      { name: "Symbols", bindings: [binding(3), binding(4)] },
    ]);

    expect(result.bindings).toEqual([
      { layerId: 10, keyPosition: 1, binding: binding(2, 8) },
    ]);
  });

  it("treats omitted numeric fields as their protocol default of zero", () => {
    const result = calculateImportChanges(
      {
        layers: [
          { id: 10, name: "Base", bindings: [{ behaviorId: 1 } as never] },
        ],
      },
      [{ name: "Base", bindings: [binding(1)] }],
    );

    expect(result).toEqual({ layerProps: [], bindings: [] });
  });
});
