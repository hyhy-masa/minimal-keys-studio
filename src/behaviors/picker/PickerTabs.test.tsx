import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PickerTabs } from "./PickerTabs";
import { keyRoleMap } from "../../keyboard/key-roles";

const fakeBehaviors = [
  { id: 10, displayName: "Key Press", metadata: [] },
  { id: 20, displayName: "Momentary Layer", metadata: [] },
  { id: 30, displayName: "Toggle Layer", metadata: [] },
  { id: 40, displayName: "Sticky Layer", metadata: [] },
];

describe("PickerTabs", () => {
  it("renders six tab buttons", () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    render(
      <PickerTabs
        keyPosition={knownPosition}
        behaviors={fakeBehaviors}
        layers={[{ id: 0, name: "Layer 0" }]}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.getByText("おすすめ")).toBeDefined();
    expect(screen.getByText("文字・記号")).toBeDefined();
    expect(screen.getByText("操作")).toBeDefined();
    expect(screen.getByText("レイヤー")).toBeDefined();
    expect(screen.getByText("修飾キー")).toBeDefined();
    expect(screen.getByText("システム")).toBeDefined();
  });

  it("defaults to recommendations tab for key with role data", () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    const role = keyRoleMap[knownPosition];
    render(
      <PickerTabs
        keyPosition={knownPosition}
        behaviors={fakeBehaviors}
        layers={[{ id: 0, name: "Layer 0" }]}
        onApplyBinding={() => {}}
      />
    );
    // Role label is only visible in recommendations tab
    expect(screen.getByText(role.roleLabel)).toBeDefined();
  });

  it("defaults to letters tab for key without role data", () => {
    render(
      <PickerTabs
        keyPosition={9999}
        behaviors={fakeBehaviors}
        layers={[{ id: 0, name: "Layer 0" }]}
        onApplyBinding={() => {}}
      />
    );
    // Placeholder text visible when letters tab is active
    expect(screen.getByText("文字・記号タブ（実装中）")).toBeDefined();
  });
});
