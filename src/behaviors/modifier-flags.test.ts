import { describe, expect, it } from "vitest";
import { formatBindingDetail } from "./binding-display";
import { getEditingItems } from "./picker/actions-data";
import {
  applyModifierFlags,
  getModifierFlags,
  replaceModifierFlags,
} from "./modifier-flags";

const keyPress = { id: 1, displayName: "Key Press" } as never;

describe("applyModifierFlags", () => {
  it("derives the Cmd checkbox state from a selected Copy shortcut", () => {
    const copy = getEditingItems("mac").find((item) => item.label === "コピー");

    expect(copy).toBeDefined();
    expect(
      getModifierFlags(
        { behaviorId: 1, param1: copy!.param1, param2: 0 },
        [keyPress],
      ),
    ).toBe(0x08);
  });

  it("replaces existing modifiers so they can be intentionally removed", () => {
    const copy = getEditingItems("mac").find((item) => item.label === "コピー");

    expect(copy).toBeDefined();
    expect(
      replaceModifierFlags(
        { behaviorId: 1, param1: copy!.param1, param2: 0 },
        0,
      ).param1,
    ).toBe(0x070006);
  });

  it("adds a selected modifier to a shortcut-free key", () => {
    expect(
      replaceModifierFlags(
        { behaviorId: 1, param1: 0x070006, param2: 0 },
        0x08,
      ).param1,
    ).toBe(0x08070006);
  });

  it("keeps the GUI flag when the Copy (Cmd+C) shortcut is selected", () => {
    const copy = getEditingItems("mac").find((item) => item.label === "コピー");

    expect(copy).toBeDefined();
    const applied = applyModifierFlags(
      { behaviorId: 1, param1: copy!.param1, param2: 0 },
      0,
      [keyPress],
    );

    expect(applied.param1 >>> 24).toBe(0x08);
  });

  it("displays the embedded shortcut modifier so Cmd+C and C do not collide", () => {
    const cmdC = formatBindingDetail(
      "Key Press",
      { behaviorId: 1, param1: (0x08 << 24) | 0x070006, param2: 0 },
      [],
    );
    const c = formatBindingDetail(
      "Key Press",
      { behaviorId: 1, param1: 0x070006, param2: 0 },
      [],
    );

    expect(cmdC).toBe("⌘C");
    expect(cmdC).not.toBe(c);
  });
});
