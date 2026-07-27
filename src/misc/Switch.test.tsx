import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Switch } from "./Switch";

describe("Switch", () => {
  it.each([
    [false, false],
    [true, true],
  ])("reflects isSelected=%s through checked state", (isSelected, checked) => {
    render(
      <Switch
        isSelected={isSelected}
        onChange={vi.fn()}
        label="自動切り替え"
      />
    );

    expect(screen.getByRole("switch")).toHaveProperty("checked", checked);
  });

  it("calls onChange with the inverted value when clicked", () => {
    const onChange = vi.fn();
    render(
      <Switch
        isSelected={false}
        onChange={onChange}
        label="自動切り替え"
      />
    );

    screen.getByRole("switch").click();

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not call onChange when disabled", () => {
    const onChange = vi.fn();
    render(
      <Switch
        isSelected={false}
        onChange={onChange}
        label="自動切り替え"
        isDisabled
      />
    );

    screen.getByRole("switch").click();

    expect(onChange).not.toHaveBeenCalled();
  });
});
