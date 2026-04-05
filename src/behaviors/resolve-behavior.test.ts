import { describe, it, expect } from "vitest";
import { resolveBehaviorId } from "./resolve-behavior";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

const fakeBehaviors: GetBehaviorDetailsResponse[] = [
  { id: 1, displayName: "Key Press", metadata: [] },
  { id: 2, displayName: "Momentary Layer", metadata: [] },
  { id: 3, displayName: "Hold-Tap", metadata: [] },
];

describe("resolveBehaviorId", () => {
  it("returns behaviorId for known displayName", () => {
    expect(resolveBehaviorId("Key Press", fakeBehaviors)).toBe(1);
    expect(resolveBehaviorId("Momentary Layer", fakeBehaviors)).toBe(2);
  });

  it("returns undefined for unknown displayName", () => {
    expect(resolveBehaviorId("Nonexistent", fakeBehaviors)).toBeUndefined();
  });
});
