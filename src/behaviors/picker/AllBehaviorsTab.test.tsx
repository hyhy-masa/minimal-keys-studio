import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllBehaviorsTab } from "./AllBehaviorsTab";

const fakeBehaviors = [
  { id: 1, displayName: "Key Press", metadata: [] },
  { id: 2, displayName: "Momentary Layer", metadata: [] },
  { id: 3, displayName: "Transparent", metadata: [] },
];

const fakeLayers = [{ id: 0, name: "Layer 0" }];

describe("AllBehaviorsTab", () => {
  it("renders category headers", () => {
    render(
      <AllBehaviorsTab
        behaviors={fakeBehaviors}
        layers={fakeLayers}
        selectedBehaviorId={1}
        onBehaviorSelected={() => {}}
      />
    );
    expect(screen.getByText("基本キー操作")).toBeDefined();
  });

  it("shows behavior items when category is expanded", () => {
    render(
      <AllBehaviorsTab
        behaviors={fakeBehaviors}
        layers={fakeLayers}
        selectedBehaviorId={1}
        onBehaviorSelected={() => {}}
      />
    );
    // "基本キー操作" category is expanded by default, should show "キー入力" (Key Press)
    expect(screen.getByText("キー入力")).toBeDefined();
  });
});
