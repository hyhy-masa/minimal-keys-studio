import { describe, expect, it } from "vitest";
import { applyModifierFlags } from "../modifier-flags";

const keyPress = { id: 1, displayName: "Key Press" } as never;

describe("applyModifierFlags", () => {
  it("does not carry key A modifiers into key B after the selection resets them", () => {
    const keyA = { behaviorId: 1, param1: 0x70004, param2: 0 };
    const keyB = { behaviorId: 1, param1: 0x70005, param2: 0 };

    const withCommand = applyModifierFlags(keyA, 0x08, [keyPress]);
    const afterSelectingKeyB = applyModifierFlags(keyB, 0, [keyPress]);

    expect(withCommand.param1 >>> 24).toBe(0x08);
    expect(afterSelectingKeyB.param1 >>> 24).toBe(0);
  });

  it("keeps modifiers embedded in the selected binding", () => {
    const binding = { behaviorId: 1, param1: (0x08 << 24) | 0x70004, param2: 0 };

    expect(applyModifierFlags(binding, 0, [keyPress]).param1 >>> 24).toBe(0x08);
  });
});
