import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModifierPanel } from "./ModifierPanel";

describe("ModifierPanel", () => {
  it("renders modifier checkboxes for mac", () => {
    render(<ModifierPanel modifierFlags={0} onModifierFlagsChanged={vi.fn()} osMode="mac" />);
    expect(screen.getByText("⌘ Cmd")).toBeTruthy();
    expect(screen.getByText("⌥ Option")).toBeTruthy();
    expect(screen.getByText("Shift")).toBeTruthy();
    expect(screen.getByText("Ctrl")).toBeTruthy();
  });

  it("renders modifier checkboxes for windows", () => {
    render(<ModifierPanel modifierFlags={0} onModifierFlagsChanged={vi.fn()} osMode="windows" />);
    expect(screen.getByText("Win")).toBeTruthy();
    expect(screen.getByText("Alt")).toBeTruthy();
    expect(screen.getByText("Shift")).toBeTruthy();
    expect(screen.getByText("Ctrl")).toBeTruthy();
  });

  it("toggles modifier flag on click", () => {
    const onChange = vi.fn();
    render(<ModifierPanel modifierFlags={0} onModifierFlagsChanged={onChange} osMode="mac" />);
    fireEvent.click(screen.getByText("⌘ Cmd"));
    expect(onChange).toHaveBeenCalledWith(0x08);
  });

  it("toggles off when already selected", () => {
    const onChange = vi.fn();
    render(<ModifierPanel modifierFlags={0x08} onModifierFlagsChanged={onChange} osMode="mac" />);
    fireEvent.click(screen.getByText("⌘ Cmd"));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("combines multiple modifiers", () => {
    const onChange = vi.fn();
    render(<ModifierPanel modifierFlags={0x08} onModifierFlagsChanged={onChange} osMode="mac" />);
    fireEvent.click(screen.getByText("Shift"));
    expect(onChange).toHaveBeenCalledWith(0x08 | 0x02);
  });

  it("shows clear button when active", () => {
    render(<ModifierPanel modifierFlags={0x08} onModifierFlagsChanged={vi.fn()} osMode="mac" />);
    expect(screen.getByText("クリア")).toBeTruthy();
  });

  it("clears all modifiers on clear click", () => {
    const onChange = vi.fn();
    render(<ModifierPanel modifierFlags={0x0a} onModifierFlagsChanged={onChange} osMode="mac" />);
    fireEvent.click(screen.getByText("クリア"));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("does not show clear button when no modifiers selected", () => {
    render(<ModifierPanel modifierFlags={0} onModifierFlagsChanged={vi.fn()} osMode="mac" />);
    expect(screen.queryByText("クリア")).toBeNull();
  });
});
