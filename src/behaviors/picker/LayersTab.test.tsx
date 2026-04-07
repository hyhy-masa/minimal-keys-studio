import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LayersTab } from "./LayersTab";

const mockBehaviors = [
  { id: 10, displayName: "Momentary Layer", metadata: [] },
  { id: 11, displayName: "Toggle Layer", metadata: [] },
  { id: 12, displayName: "Layer-Tap", metadata: [] },
  { id: 13, displayName: "Sticky Layer", metadata: [] },
  { id: 14, displayName: "To Layer", metadata: [] },
  { id: 1, displayName: "Key Press", metadata: [] },
];

const layers = [
  { id: 0, name: "Base" },
  { id: 1, name: "Symbols" },
  { id: 2, name: "Nav" },
];

describe("LayersTab", () => {
  it("renders layer behavior options", () => {
    const onApply = vi.fn();
    render(<LayersTab behaviors={mockBehaviors} layers={layers} onApplyBinding={onApply} />);
    expect(screen.getByText("一時レイヤー")).toBeTruthy();
    expect(screen.getByText("レイヤー切替")).toBeTruthy();
    expect(screen.getByText("レイヤー / タップ")).toBeTruthy();
  });

  it("shows layer selection after behavior click", () => {
    const onApply = vi.fn();
    render(<LayersTab behaviors={mockBehaviors} layers={layers} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("一時レイヤー"));
    expect(screen.getByText("Base")).toBeTruthy();
    expect(screen.getByText("Symbols")).toBeTruthy();
    expect(screen.getByText("Nav")).toBeTruthy();
  });

  it("Momentary Layer: apply immediately on layer click", () => {
    const onApply = vi.fn();
    render(<LayersTab behaviors={mockBehaviors} layers={layers} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("一時レイヤー"));
    fireEvent.click(screen.getByText("Symbols"));
    expect(onApply).toHaveBeenCalledWith({ behaviorId: 10, param1: 1, param2: 0 });
  });

  it("Layer-Tap: shows apply button disabled initially", () => {
    const onApply = vi.fn();
    render(<LayersTab behaviors={mockBehaviors} layers={layers} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("レイヤー / タップ"));
    const applyBtn = screen.getByText("適用する");
    expect(applyBtn).toHaveAttribute("disabled");
  });

  it("Layer-Tap: apply button enabled after both params", () => {
    const onApply = vi.fn();
    render(<LayersTab behaviors={mockBehaviors} layers={layers} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("レイヤー / タップ"));
    fireEvent.click(screen.getByText("Symbols"));
    fireEvent.click(screen.getByText("Space"));
    const applyBtn = screen.getByText("適用する");
    expect(applyBtn).not.toHaveAttribute("disabled");
  });

  it("Layer-Tap: apply sends correct binding", () => {
    const onApply = vi.fn();
    render(<LayersTab behaviors={mockBehaviors} layers={layers} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("レイヤー / タップ"));
    fireEvent.click(screen.getByText("Symbols"));
    fireEvent.click(screen.getByText("Space"));
    fireEvent.click(screen.getByText("適用する"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 12,
      param1: 1,
      param2: (7 << 16) + 44, // KB page 7, Space = 44
    });
  });
});
