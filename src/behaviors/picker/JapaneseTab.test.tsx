import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JapaneseTab } from "./JapaneseTab";
import { hid_usage_from_page_and_id } from "../../hid-usages";

const mockBehaviors = [{ id: 1, displayName: "Key Press", metadata: [] }];

describe("JapaneseTab", () => {
  it("renders Japanese key options", () => {
    const onApply = vi.fn();
    render(<JapaneseTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    expect(screen.getByText("半角/全角")).toBeTruthy();
    expect(screen.getByText("LANG1")).toBeTruthy();
    expect(screen.getByText("LANG2")).toBeTruthy();
    expect(screen.getByText("変換")).toBeTruthy();
    expect(screen.getByText("無変換")).toBeTruthy();
  });

  it("applies LANG1 binding on click", () => {
    const onApply = vi.fn();
    render(<JapaneseTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("LANG1"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 1,
      param1: hid_usage_from_page_and_id(7, 144),
      param2: 0,
    });
  });
});
