import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModifiersTab } from "./ModifiersTab";
import { hid_usage_from_page_and_id } from "../../hid-usages";

const mockBehaviors = [
  { id: 1, displayName: "Key Press", metadata: [] },
  { id: 20, displayName: "Mod-Tap", metadata: [] },
  { id: 21, displayName: "Sticky Key", metadata: [] },
];

describe("ModifiersTab", () => {
  it("renders mode buttons with descriptions", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} onApplyBinding={onApply} />);
    expect(screen.getByText("修飾キー")).toBeTruthy();
    expect(screen.getByText("Mod-Tap")).toBeTruthy();
    expect(screen.getByText("短押し=キー、長押し=修飾キー")).toBeTruthy();
    expect(screen.getByText("ワンショット")).toBeTruthy();
  });

  it("renders modifier options", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} onApplyBinding={onApply} />);
    expect(screen.getByText("Ctrl (左)")).toBeTruthy();
    expect(screen.getByText("Shift (左)")).toBeTruthy();
  });

  it("standalone mode: apply immediately on modifier click", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("Ctrl (左)"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 1,
      param1: hid_usage_from_page_and_id(7, 224),
      param2: 0,
    });
  });

  it("sticky mode: apply immediately on modifier click", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("ワンショット"));
    fireEvent.click(screen.getByText("Shift (左)"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 21,
      param1: 0x02,
      param2: 0,
    });
  });

  it("mod-tap mode: apply button disabled until both params set", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("Mod-Tap"));
    const applyBtn = screen.getByText("適用する");
    expect(applyBtn).toHaveAttribute("disabled");
  });

  it("mod-tap mode: apply sends correct binding", () => {
    const onApply = vi.fn();
    render(<ModifiersTab behaviors={mockBehaviors} layers={[]} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("Mod-Tap"));
    fireEvent.click(screen.getByText("Ctrl (左)"));
    fireEvent.click(screen.getByText("A"));
    fireEvent.click(screen.getByText("適用する"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 20,
      param1: 0x01,
      param2: hid_usage_from_page_and_id(7, 4),
    });
  });
});
