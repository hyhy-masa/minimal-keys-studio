import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { Keymap as KeymapMsg, PhysicalLayout } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { UserOS } from "../behaviors/use-cases";

const os = vi.hoisted(() => ({ mode: "mac" as UserOS }));
vi.mock("../OsModeContext", () => ({
  useOsMode: () => ({ osMode: os.mode, setOsMode: () => {} }),
}));

import { Keymap } from "../keyboard/Keymap";
import { MacrosContext, type MacrosContextValue } from "./MacrosContext";
import { macroBindingLabel, macroSummary, macroTooltipData } from "./macro-labels";
import { formatBindingDetail } from "../behaviors/binding-display";
import type { StoredMacro } from "./macro-client";
import { textToValues } from "./macro-text";

const CMD_C = 0x08070006;
const MACROS: StoredMacro[] = [
  {
    index: 0,
    name: "コピーして送る",
    tapMs: 30,
    waitMs: 40,
    steps: [{ type: 1, value: CMD_C }, ...textToValues("ok", "jis").values.map((value) => ({ type: 1, value }))],
  },
];

describe("macro labels", () => {
  it("names a slot as M1 with the macro name, or M1 alone when unknown", () => {
    expect(macroBindingLabel(0, MACROS)).toBe("M1 コピーして送る");
    expect(macroBindingLabel(4, MACROS)).toBe("M5");
    expect(formatBindingDetail("Macro", { behaviorId: 1, param1: 2, param2: 0 }, [])).toBe("M3");
  });

  it("describes the steps with Mac or Windows key names", () => {
    expect(macroSummary(MACROS[0], "mac", "jis")).toBe("⌘ Cmd + C → 文字「ok」");
    expect(macroSummary(MACROS[0], "windows", "jis")).toBe("Win + C → 文字「ok」");
    expect(macroTooltipData(9, MACROS, "mac", "jis").roleName).toBe("M10");
  });
});

const behaviors: Record<number, GetBehaviorDetailsResponse> = {
  7: { id: 7, displayName: "Macro", metadata: [] },
};
const layout: PhysicalLayout = {
  name: "t",
  keys: [0, 1].map((i) => ({ width: 100, height: 100, x: i * 100, y: 0, r: 0, rx: 0, ry: 0 })),
};
const keymap: KeymapMsg = {
  layers: [{ id: 0, name: "Base", bindings: [{ behaviorId: 7, param1: 0, param2: 0 }, { behaviorId: 7, param1: 1, param2: 0 }] }],
  availableLayers: 1,
  maxLayerNameLength: 16,
};

function renderKeymap(macros: StoredMacro[]) {
  const value: MacrosContextValue = { status: "ready", info: null, macros, refresh: async () => {}, call: null };
  return render(
    <MacrosContext.Provider value={value}>
      <Keymap
        layout={layout}
        keymap={keymap}
        behaviors={behaviors}
        oneU={48}
        selectedLayerIndex={0}
        selectedKeyPosition={undefined}
        onKeyPositionClicked={() => {}}
      />
    </MacrosContext.Provider>,
  );
}

describe("macro keys on the keymap", () => {
  afterEach(() => vi.useRealTimers());

  it.each<UserOS>(["mac", "windows"])("show Macro / M1 on the keycap in %s mode", (mode) => {
    os.mode = mode;
    renderKeymap(MACROS);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["MacroM1", "MacroM2"]);
  });

  it.each<[UserOS, string]>([
    ["mac", "⌘ Cmd + C → 文字「ok」"],
    ["windows", "Win + C → 文字「ok」"],
  ])("the tooltip gives the name and the steps in %s mode", (mode, summary) => {
    os.mode = mode;
    vi.useFakeTimers();
    renderKeymap(MACROS);
    fireEvent.mouseEnter(screen.getAllByRole("button")[0]);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText("M1 コピーして送る")).toBeInTheDocument();
    expect(screen.getByText(summary)).toBeInTheDocument();
  });

  it("falls back to M2 when the macro is not loaded", () => {
    os.mode = "mac";
    vi.useFakeTimers();
    renderKeymap(MACROS);
    fireEvent.mouseEnter(screen.getAllByRole("button")[1]);
    act(() => { vi.advanceTimersByTime(300); });
    // The keycap and the tooltip both read M2; the tooltip adds why there is no detail.
    expect(screen.getAllByText("M2")).toHaveLength(2);
    expect(screen.getByText(/このマクロの中身は読み込めていません/)).toBeInTheDocument();
  });
});
