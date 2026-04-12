import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JapaneseTab } from "./JapaneseTab";
import { hid_usage_from_page_and_id } from "../../hid-usages";

const mockBehaviors = [{ id: 1, displayName: "Key Press", metadata: [] }];

describe("JapaneseTab", () => {
  it("Mac mode: shows LANG1/LANG2 buttons", () => {
    const onApply = vi.fn();
    render(<JapaneseTab behaviors={mockBehaviors} osMode="mac" onApplyBinding={onApply} />);
    expect(screen.getByText("日本語にする")).toBeTruthy();
    expect(screen.getByText("英語にする")).toBeTruthy();
  });

  it("Mac mode: applies LANG1 on click", () => {
    const onApply = vi.fn();
    render(<JapaneseTab behaviors={mockBehaviors} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("日本語にする"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 1,
      param1: hid_usage_from_page_and_id(7, 144),
      param2: 0,
    });
  });

  it("Windows mode: shows IME切替 button", () => {
    const onApply = vi.fn();
    render(<JapaneseTab behaviors={mockBehaviors} osMode="windows" onApplyBinding={onApply} />);
    expect(screen.getByText("IME切替")).toBeTruthy();
    expect(screen.queryByText("日本語にする")).toBeNull();
  });

  it("Windows mode: applies Grave key on IME click", () => {
    const onApply = vi.fn();
    render(<JapaneseTab behaviors={mockBehaviors} osMode="windows" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("IME切替"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 1,
      param1: hid_usage_from_page_and_id(7, 53),
      param2: 0,
    });
  });

  it("shows common keys on both modes", () => {
    const onApply = vi.fn();
    render(<JapaneseTab behaviors={mockBehaviors} osMode="mac" onApplyBinding={onApply} />);
    expect(screen.getByText("変換")).toBeTruthy();
    expect(screen.getByText("無変換")).toBeTruthy();
  });
});
