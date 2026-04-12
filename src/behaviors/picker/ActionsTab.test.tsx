import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionsTab } from "./ActionsTab";

const mockBehaviors = [
  { id: 1, displayName: "Key Press", metadata: [] },
  { id: 2, displayName: "Mouse Key Press", metadata: [] },
];

describe("ActionsTab", () => {
  it("renders subcategory buttons", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    expect(screen.getByText("キー操作")).toBeTruthy();
    expect(screen.getByText("マウス")).toBeTruthy();
    expect(screen.getByText("メディア")).toBeTruthy();
    expect(screen.getByText("ナビゲーション")).toBeTruthy();
  });

  it("shows shortcuts by default for non-thumb key", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    expect(screen.getByText("コピー")).toBeTruthy();
    expect(screen.getByText("貼り付け")).toBeTruthy();
  });

  it("shows mouse buttons when mouse subcategory selected", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("マウス"));
    expect(screen.getByText("左クリック")).toBeTruthy();
    expect(screen.getByText("右クリック")).toBeTruthy();
  });

  it("shows media controls when media subcategory selected", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("メディア"));
    expect(screen.getByText("再生/一時停止")).toBeTruthy();
    expect(screen.getByText("音量を上げる")).toBeTruthy();
  });

  it("shows navigation keys when nav subcategory selected", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("ナビゲーション"));
    expect(screen.getByText("↑")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
  });

  it("calls onApplyBinding for mouse click", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("マウス"));
    fireEvent.click(screen.getByText("左クリック"));
    expect(onApply).toHaveBeenCalledWith({ behaviorId: 2, param1: 0x01, param2: 0 });
  });
});
