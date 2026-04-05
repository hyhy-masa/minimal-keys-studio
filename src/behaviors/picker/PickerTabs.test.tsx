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
  it("renders three tab buttons", () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    render(
      <PickerTabs
        keyPosition={knownPosition}
        behaviors={fakeBehaviors}
        layers={[{ id: 0, name: "Layer 0" }]}
        selectedBehaviorId={10}
        onApplyBinding={() => {}}
        onBehaviorSelected={() => {}}
      />
    );
    expect(screen.getByText("おすすめ")).toBeDefined();
    expect(screen.getByText("用途別")).toBeDefined();
    expect(screen.getByText("すべて")).toBeDefined();
  });

  it("defaults to recommendations tab for key with role data", () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    const role = keyRoleMap[knownPosition];
    render(
      <PickerTabs
        keyPosition={knownPosition}
        behaviors={fakeBehaviors}
        layers={[{ id: 0, name: "Layer 0" }]}
        selectedBehaviorId={10}
        onApplyBinding={() => {}}
        onBehaviorSelected={() => {}}
      />
    );
    // Role label is only visible in recommendations tab
    expect(screen.getByText(role.roleLabel)).toBeDefined();
  });

  it("defaults to use-cases tab for key without role data", () => {
    render(
      <PickerTabs
        keyPosition={9999}
        behaviors={fakeBehaviors}
        layers={[{ id: 0, name: "Layer 0" }]}
        selectedBehaviorId={10}
        onApplyBinding={() => {}}
        onBehaviorSelected={() => {}}
      />
    );
    // Use case categories visible when use-cases tab is active
    expect(screen.getByText("よく使う操作")).toBeDefined();
  });
});
