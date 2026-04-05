import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecommendationsTab } from "./RecommendationsTab";
import { keyRoleMap } from "../../keyboard/key-roles";

const fakeBehaviors = [
  { id: 10, displayName: "Key Press", metadata: [] },
  { id: 20, displayName: "Momentary Layer", metadata: [] },
  { id: 30, displayName: "Toggle Layer", metadata: [] },
];

describe("RecommendationsTab", () => {
  it("shows role label for known key position", () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    const role = keyRoleMap[knownPosition];
    render(
      <RecommendationsTab
        keyPosition={knownPosition}
        behaviors={fakeBehaviors}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.getByText(role.roleLabel)).toBeDefined();
  });

  it("shows fallback message for unknown key position", () => {
    render(
      <RecommendationsTab
        keyPosition={9999}
        behaviors={fakeBehaviors}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.getByText(/用途別/)).toBeDefined();
  });

  it("renders recommendation cards", () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    const role = keyRoleMap[knownPosition];
    render(
      <RecommendationsTab
        keyPosition={knownPosition}
        behaviors={fakeBehaviors}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.getByText(role.recommendations[0].label)).toBeDefined();
  });

  it("calls onApplyBinding when card is clicked", async () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    const role = keyRoleMap[knownPosition];
    const onApply = vi.fn();
    render(
      <RecommendationsTab
        keyPosition={knownPosition}
        behaviors={fakeBehaviors}
        onApplyBinding={onApply}
      />
    );
    await userEvent.click(screen.getByText(role.recommendations[0].label));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      param1: role.recommendations[0].param1,
      param2: role.recommendations[0].param2,
    }));
  });
});
