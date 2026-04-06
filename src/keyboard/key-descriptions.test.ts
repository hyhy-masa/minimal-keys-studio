import { describe, it, expect } from "vitest";
import {
  getHidKeyDescription,
  getMouseKeyDescription,
  getBehaviorRoleName,
  ENCODER_POSITION,
  ENCODER_ADJUSTABLE_OPTIONS,
} from "./key-descriptions";

describe("getHidKeyDescription", () => {
  it("returns role for standard letter keys", () => {
    const desc = getHidKeyDescription(7, 4); // page 7 (Keyboard), id 4 (A)
    expect(desc.roleName).toBe("A");
    expect(desc.description).toBe("文字入力");
  });

  it("returns role for function keys", () => {
    const desc = getHidKeyDescription(7, 62); // F5
    expect(desc.roleName).toBe("F5");
    expect(desc.description).toBe("更新・再読み込み");
  });

  it("returns role for special keys", () => {
    const desc = getHidKeyDescription(7, 44); // Space
    expect(desc.roleName).toBe("スペース");
    expect(desc.description).toBe("空白を入力");
  });

  it("returns generic fallback for unknown keys", () => {
    const desc = getHidKeyDescription(7, 9999);
    expect(desc.roleName).toBeTruthy();
    expect(desc.description).toBe("キー入力");
  });

  it("returns role for number keys", () => {
    const desc1 = getHidKeyDescription(7, 30); // 1
    expect(desc1.roleName).toBe("1");
    expect(desc1.description).toBe("数字入力");

    const desc0 = getHidKeyDescription(7, 39); // 0
    expect(desc0.roleName).toBe("0");
    expect(desc0.description).toBe("数字入力");
  });
});

describe("getMouseKeyDescription", () => {
  it("returns description for left click", () => {
    const desc = getMouseKeyDescription(1);
    expect(desc.roleName).toBe("左クリック");
    expect(desc.description).toBe("選択・決定");
  });

  it("returns description for right click", () => {
    const desc = getMouseKeyDescription(2);
    expect(desc.roleName).toBe("右クリック");
    expect(desc.description).toBe("メニューを開く");
  });
});

describe("getBehaviorRoleName", () => {
  it("returns Japanese name for layer behaviors", () => {
    expect(getBehaviorRoleName("Momentary Layer")).toBe("一時レイヤー");
    expect(getBehaviorRoleName("Toggle Layer")).toBe("レイヤー切替");
  });

  it("returns Japanese name for system behaviors", () => {
    expect(getBehaviorRoleName("None")).toBe("無効");
    expect(getBehaviorRoleName("Transparent")).toBe("透過");
  });

  it("returns displayName for unknown behaviors", () => {
    expect(getBehaviorRoleName("Custom Thing")).toBe("Custom Thing");
  });
});

describe("encoder constants", () => {
  it("has encoder position defined", () => {
    expect(typeof ENCODER_POSITION).toBe("number");
  });

  it("has adjustable options", () => {
    expect(ENCODER_ADJUSTABLE_OPTIONS.length).toBeGreaterThan(0);
    expect(ENCODER_ADJUSTABLE_OPTIONS[0]).toHaveProperty("label");
  });
});
