import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LettersTab } from "./LettersTab";
import { hid_usage_from_page_and_id } from "../../hid-usages";

const mockBehaviors = [
  { id: 1, displayName: "Key Press", metadata: [] },
];

describe("LettersTab", () => {
  it("renders letter grid by default", () => {
    const onApply = vi.fn();
    render(<LettersTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("Z")).toBeTruthy();
  });

  it("calls onApplyBinding with correct HID usage on letter click", () => {
    const onApply = vi.fn();
    render(<LettersTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("V"));
    // V = keyboard page 7, id 25
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 1,
      param1: hid_usage_from_page_and_id(7, 25),
      param2: 0,
    });
  });

  it("switches to number subcategory", () => {
    const onApply = vi.fn();
    render(<LettersTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("0-9"));
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("switches to F-keys subcategory", () => {
    const onApply = vi.fn();
    render(<LettersTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("F1-F12"));
    expect(screen.getByText("F1")).toBeTruthy();
    expect(screen.getByText("F12")).toBeTruthy();
  });

  it("switches to symbols subcategory", () => {
    const onApply = vi.fn();
    render(<LettersTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("記号"));
    expect(screen.getByText("-")).toBeTruthy();
    expect(screen.getByText("/")).toBeTruthy();
  });

  it("switches to special keys subcategory", () => {
    const onApply = vi.fn();
    render(<LettersTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("特殊"));
    expect(screen.getByText("Enter")).toBeTruthy();
    expect(screen.getByText("Space")).toBeTruthy();
  });
});
