import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PickerTabs } from "./PickerTabs";
import { OsModeProvider } from "../../OsModeContext";
import { MacrosContext, type MacrosContextValue } from "../../macros/MacrosContext";
import { BehaviorBindingPicker } from "../BehaviorBindingPicker";
import { ComboActionPicker } from "../../combos/ComboActionPicker";
import type { StoredMacro } from "../../macros/macro-client";

const base = [
  { id: 10, displayName: "Key Press", metadata: [] },
  { id: 20, displayName: "Momentary Layer", metadata: [] },
];
const withMacro = [...base, { id: 55, displayName: "Macro", metadata: [] }];
const layers = [{ id: 0, index: 0, name: "Layer 0" }];

const MACROS: StoredMacro[] = [
  { index: 1, name: "列幅", tapMs: 30, waitMs: 40, steps: [] },
  { index: 0, name: "メール", tapMs: 30, waitMs: 40, steps: [] },
];

function ctx(macros: StoredMacro[], status: MacrosContextValue["status"] = "ready"): MacrosContextValue {
  return { status, info: null, macros, refresh: async () => {}, call: null };
}

function renderTabs(behaviors = withMacro, value = ctx(MACROS), onApply = vi.fn()) {
  render(
    <OsModeProvider>
      <MacrosContext.Provider value={value}>
        <PickerTabs keyPosition={3} behaviors={behaviors} layers={layers} onApplyBinding={onApply} />
      </MacrosContext.Provider>
    </OsModeProvider>,
  );
  return onApply;
}

describe("picker マクロ tab", () => {
  it("is hidden when the firmware has no Macro behavior", () => {
    renderTabs(base);
    expect(screen.queryByRole("button", { name: "マクロ" })).not.toBeInTheDocument();
    expect(screen.getByText("システム")).toBeInTheDocument();
  });

  it("lists stored macros as M1 名前 in slot order", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("button", { name: "マクロ" }));
    expect(screen.getAllByRole("button", { name: /^M\d/ }).map((b) => b.getAttribute("aria-label"))).toEqual([
      "M1 メール",
      "M2 列幅",
    ]);
  });

  it("applies the Macro binding with the 0-based slot", () => {
    const onApply = renderTabs();
    fireEvent.click(screen.getByRole("button", { name: "マクロ" }));
    fireEvent.click(screen.getByRole("button", { name: "M2 列幅" }));
    expect(onApply).toHaveBeenCalledWith({ behaviorId: 55, param1: 1, param2: 0 }, "macro");
  });

  it("points to the マクロ tab when there are no macros yet", () => {
    renderTabs(withMacro, ctx([]));
    fireEvent.click(screen.getByRole("button", { name: "マクロ" }));
    expect(screen.getByText("まだマクロがありません。画面上の「マクロ」タブで作ると、ここから選べます。")).toBeInTheDocument();
  });

  it("says when the list is still loading", () => {
    renderTabs(withMacro, ctx([], "loading"));
    fireEvent.click(screen.getByRole("button", { name: "マクロ" }));
    expect(screen.getByText("マクロを読み込み中...")).toBeInTheDocument();
  });

  it("the current setting shows the macro name", () => {
    render(
      <OsModeProvider>
        <MacrosContext.Provider value={ctx(MACROS)}>
          <BehaviorBindingPicker
            binding={{ behaviorId: 55, param1: 0, param2: 0 }}
            behaviors={withMacro}
            layers={layers}
            onBindingChanged={() => {}}
          />
        </MacrosContext.Provider>
      </OsModeProvider>,
    );
    expect(screen.getByText("→ M1 メール")).toBeInTheDocument();
  });

  it("the combo editor's picker can assign a macro", () => {
    const onBindingChange = vi.fn();
    render(
      <OsModeProvider>
        <MacrosContext.Provider value={ctx(MACROS)}>
          <ComboActionPicker
            binding={null}
            pendingModifiers={0}
            onPendingModifiersChange={() => {}}
            onBindingChange={onBindingChange}
            behaviors={withMacro}
            layers={layers}
          />
        </MacrosContext.Provider>
      </OsModeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "マクロ" }));
    fireEvent.click(screen.getByRole("button", { name: "M1 メール" }));
    expect(onBindingChange).toHaveBeenCalledWith({ behaviorId: 55, param1: 0, param2: 0 });
  });
});
