import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SystemTab } from "./SystemTab";

const mockBehaviors = [
  { id: 30, displayName: "None", metadata: [] },
  { id: 31, displayName: "Transparent", metadata: [] },
  { id: 32, displayName: "Bluetooth", metadata: [] },
  { id: 33, displayName: "Reset", metadata: [] },
  { id: 34, displayName: "Bootloader", metadata: [] },
  { id: 35, displayName: "Soft Off", metadata: [] },
  { id: 1, displayName: "Key Press", metadata: [] },
];

describe("SystemTab", () => {
  it("renders system options (excludes non-system behaviors)", () => {
    const onApply = vi.fn();
    render(<SystemTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    expect(screen.getByText("無効")).toBeTruthy();
    expect(screen.getByText("透過")).toBeTruthy();
    expect(screen.getByText("リセット")).toBeTruthy();
    expect(screen.queryByText("キー入力")).toBeNull();
  });

  it("None: click to apply immediately", () => {
    const onApply = vi.fn();
    render(<SystemTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("無効"));
    expect(onApply).toHaveBeenCalledWith({ behaviorId: 30, param1: 0, param2: 0 });
  });

  it("Transparent: click to apply immediately", () => {
    const onApply = vi.fn();
    render(<SystemTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("透過"));
    expect(onApply).toHaveBeenCalledWith({ behaviorId: 31, param1: 0, param2: 0 });
  });

  it("renders Bluetooth operations", () => {
    const onApply = vi.fn();
    render(<SystemTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    expect(screen.getByText("BT クリア")).toBeTruthy();
    expect(screen.getByText("BT 次へ")).toBeTruthy();
  });

  it("BT operation: click to apply with param1", () => {
    const onApply = vi.fn();
    render(<SystemTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("BT 次へ"));
    expect(onApply).toHaveBeenCalledWith({ behaviorId: 32, param1: 1, param2: 0 });
  });
});
