import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModifiersTab } from "./ModifiersTab";
import { hid_usage_from_page_and_id } from "../../hid-usages";

const mockBehaviors = [
  { id: 1, displayName: "Key Press", metadata: [] },
  { id: 20, displayName: "Mod-Tap", metadata: [] },
];

describe("ModifiersTab", () => {
  it("renders mode buttons with descriptions", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    expect(screen.getByText("修飾キー")).toBeTruthy();
    expect(screen.getByText("Mod-Tap")).toBeTruthy();
    expect(screen.getByText("短押し=キー、長押し=修飾キー")).toBeTruthy();
    expect(screen.queryByText("ワンショット")).toBeNull();
  });

  it("renders modifier options", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    expect(screen.getByText("Ctrl (左)")).toBeTruthy();
    expect(screen.getByText("Shift (左)")).toBeTruthy();
  });

  it("standalone mode: select modifier then apply", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("Ctrl (左)"));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("適用する"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 1,
      param1: hid_usage_from_page_and_id(7, 224),
      param2: 0,
    });
  });

  it("standalone mode: apply disabled without selection", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    const applyBtn = screen.getByText("適用する");
    expect(applyBtn).toHaveAttribute("disabled");
  });

  it("mod-tap mode: apply button disabled until both params set", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("Mod-Tap"));
    const applyBtn = screen.getByText("適用する");
    expect(applyBtn).toHaveAttribute("disabled");
  });

  it("mod-tap mode: apply sends correct binding", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("Mod-Tap"));
    fireEvent.click(screen.getByText("Ctrl (左)"));
    fireEvent.click(screen.getByText("A"));
    fireEvent.click(screen.getByText("適用する"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 20,
      param1: hid_usage_from_page_and_id(7, 224), // Left Ctrl HID usage
      param2: hid_usage_from_page_and_id(7, 4),   // A HID usage
    });
  });
});
