import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UseCasesTab } from "./UseCasesTab";

const fakeBehaviors = [
  { id: 10, displayName: "Key Press", metadata: [] },
  { id: 20, displayName: "Momentary Layer", metadata: [] },
  { id: 30, displayName: "Toggle Layer", metadata: [] },
  { id: 40, displayName: "Sticky Layer", metadata: [] },
];

const fakeLayers = [{ id: 0, name: "Layer 0" }, { id: 1, name: "Layer 1" }];

describe("UseCasesTab", () => {
  it("renders category buttons", () => {
    render(
      <UseCasesTab behaviors={fakeBehaviors} layers={fakeLayers} onApplyBinding={() => {}} />
    );
    expect(screen.getByText("よく使う操作")).toBeDefined();
    expect(screen.getByText("仕事効率化")).toBeDefined();
    expect(screen.getByText("レイヤーを使う")).toBeDefined();
  });

  it("shows items for default category (common actions)", () => {
    render(
      <UseCasesTab behaviors={fakeBehaviors} layers={fakeLayers} onApplyBinding={() => {}} />
    );
    expect(screen.getByText("コピーする")).toBeDefined();
  });

  it("calls onApplyBinding with resolved behaviorId on item click", async () => {
    const onApply = vi.fn();
    render(
      <UseCasesTab behaviors={fakeBehaviors} layers={fakeLayers} onApplyBinding={onApply} />
    );
    await userEvent.click(screen.getByText("コピーする"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 10,
      param1: expect.any(Number),
      param2: 0,
    });
  });
});
