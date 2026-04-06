import { describe, it, expect } from "vitest";
import { resolveTooltipData, TooltipType } from "./tooltip-data";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { hid_usage_from_page_and_id } from "../hid-usages";
import { ENCODER_POSITION } from "./key-descriptions";

const KB = 7;
const key = (id: number) => hid_usage_from_page_and_id(KB, id);
const gui = (usage: number) => (0x08 << 24) | usage;

const fakeBehaviors: GetBehaviorDetailsResponse[] = [
  { id: 1, displayName: "Key Press", metadata: [] },
  { id: 2, displayName: "Momentary Layer", metadata: [] },
  { id: 3, displayName: "None", metadata: [] },
  { id: 4, displayName: "Mouse Key Press", metadata: [] },
  { id: 5, displayName: "Layer-Tap", metadata: [] },
  { id: 6, displayName: "Transparent", metadata: [] },
];

describe("resolveTooltipData", () => {
  it("resolves letter key to simple tooltip", () => {
    const binding: BehaviorBinding = { behaviorId: 1, param1: key(4), param2: 0 }; // A
    const result = resolveTooltipData(binding, fakeBehaviors, 10, "mac");
    expect(result.type).toBe("simple" satisfies TooltipType);
    expect(result.roleName).toBe("A");
    expect(result.description).toBe("文字入力");
  });

  it("resolves Ctrl+C to use case match (copy)", () => {
    const binding: BehaviorBinding = { behaviorId: 1, param1: gui(key(6)), param2: 0 }; // Cmd+C
    const result = resolveTooltipData(binding, fakeBehaviors, 10, "mac");
    expect(result.roleName).toBe("コピーする");
    expect(result.description).toContain("記憶");
    expect(result.type).toBe("detail" satisfies TooltipType);
  });

  it("resolves thumb key with recommendations", () => {
    const binding: BehaviorBinding = { behaviorId: 1, param1: key(44), param2: 0 }; // Space
    const result = resolveTooltipData(binding, fakeBehaviors, 38, "mac"); // left thumb center
    expect(result.type).toBe("detail" satisfies TooltipType);
    expect(result.recommendations).toBeDefined();
    expect(result.recommendations!.length).toBeGreaterThan(0);
  });

  it("resolves layer behavior with description", () => {
    const binding: BehaviorBinding = { behaviorId: 2, param1: 1, param2: 0 };
    const result = resolveTooltipData(binding, fakeBehaviors, 15, "mac");
    expect(result.roleName).toBe("一時レイヤー");
    expect(result.description).toBeTruthy();
    expect(result.type).toBe("detail" satisfies TooltipType);
  });

  it("resolves None binding", () => {
    const binding: BehaviorBinding = { behaviorId: 3, param1: 0, param2: 0 };
    const result = resolveTooltipData(binding, fakeBehaviors, 15, "mac");
    expect(result.roleName).toBe("無効");
    expect(result.description).toContain("何も起きません");
  });

  it("resolves encoder position", () => {
    const binding: BehaviorBinding = { behaviorId: 1, param1: key(20), param2: 0 }; // Q
    const result = resolveTooltipData(binding, fakeBehaviors, ENCODER_POSITION, "mac");
    expect(result.type).toBe("encoder" satisfies TooltipType);
    expect(result.isEncoder).toBe(true);
  });

  it("resolves Transparent binding", () => {
    const binding: BehaviorBinding = { behaviorId: 6, param1: 0, param2: 0 };
    const result = resolveTooltipData(binding, fakeBehaviors, 10, "mac");
    expect(result.roleName).toBe("透過");
    expect(result.description).toContain("下のレイヤー");
  });

  it("resolves Ctrl+C to use case match on Windows", () => {
    const ctrl = (usage: number) => (0x01 << 24) | usage;
    const binding: BehaviorBinding = { behaviorId: 1, param1: ctrl(key(6)), param2: 0 };
    const result = resolveTooltipData(binding, fakeBehaviors, 10, "windows");
    expect(result.roleName).toBe("コピーする");
    expect(result.type).toBe("detail");
  });

  it("resolves unregistered modifier combo with prefix", () => {
    const shift = (usage: number) => (0x02 << 24) | usage;
    const binding: BehaviorBinding = { behaviorId: 1, param1: shift(key(4)), param2: 0 };
    const result = resolveTooltipData(binding, fakeBehaviors, 10, "mac");
    expect(result.roleName).toBe("Shift+A");
    expect(result.type).toBe("simple");
  });
});
