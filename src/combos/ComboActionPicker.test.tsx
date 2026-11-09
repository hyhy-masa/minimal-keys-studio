import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const os = vi.hoisted(() => ({ mode: "windows" as "windows" | "mac" }));

vi.mock("../OsModeContext", () => ({
  useOsMode: () => ({ osMode: os.mode, setOsMode: vi.fn() }),
}));

import { ComboActionPicker } from "./ComboActionPicker";
import { comboShortcutLabel } from "./combo-shortcut";
import type { Binding } from "../proto/combos";

const KEY_PRESS = 3;
const MOMENTARY_LAYER = 4;
const ENTER = 0x00070028;
const ALT_ENTER = 0x04070028;

const behaviors = [
  { id: KEY_PRESS, displayName: "Key Press", metadata: [] },
  { id: MOMENTARY_LAYER, displayName: "Momentary Layer", metadata: [] },
] as never[];

const layers = [
  { id: 5, index: 0, name: "Base" },
  { id: 9, index: 1, name: "Num" },
];

let latest: Binding | null = null;

function Harness({ initial = null }: { initial?: Binding | null }) {
  const [binding, setBinding] = useState<Binding | null>(initial);
  const [pending, setPending] = useState(0);
  latest = binding;
  return (
    <ComboActionPicker
      binding={binding}
      pendingModifiers={pending}
      onPendingModifiersChange={setPending}
      onBindingChange={setBinding}
      behaviors={behaviors}
      layers={layers}
    />
  );
}

const chip = (name: string) => screen.getByRole("button", { name });
const result = () => screen.getByTestId("combo-action-result").textContent;

const pickEnter = () => fireEvent.click(chip("Enter"));

beforeEach(() => {
  os.mode = "windows";
  latest = null;
});

describe("ComboActionPicker", () => {
  it("modifier first, then key, sends Alt+Enter", () => {
    render(<Harness />);
    fireEvent.click(chip("Alt"));
    pickEnter();
    expect(latest).toEqual({ behaviorId: KEY_PRESS, param1: ALT_ENTER, param2: 0 });
    expect(result()).toBe("Alt+Enter");
  });

  it("key first, then modifier, sends the same value", () => {
    render(<Harness />);
    pickEnter();
    expect(latest?.param1).toBe(ENTER);
    fireEvent.click(chip("Alt"));
    expect(latest?.param1).toBe(ALT_ENTER);
    expect(chip("Alt")).toHaveAttribute("aria-pressed", "true");
  });

  it("a key from the tabs carries the modifiers too", () => {
    render(<Harness />);
    fireEvent.click(chip("Alt"));
    fireEvent.click(screen.getByRole("button", { name: "A-Z" }));
    fireEvent.click(chip("A"));
    expect(latest?.param1).toBe(0x04070004);
    expect(result()).toBe("Alt+A");
  });

  it("two modifiers plus a letter from the tabs: Cmd+Shift+T", () => {
    os.mode = "mac";
    render(<Harness />);
    fireEvent.click(chip("⌘ Cmd"));
    fireEvent.click(chip("Shift"));
    fireEvent.click(chip("T"));
    expect(latest).toEqual({ behaviorId: KEY_PRESS, param1: 0x0a070017, param2: 0 });
    expect(result()).toBe("⌘ Cmd+Shift+T");
  });

  it("letter first, then two modifiers, gives the same Cmd+Shift+T", () => {
    os.mode = "mac";
    render(<Harness />);
    fireEvent.click(chip("T"));
    fireEvent.click(chip("Shift"));
    fireEvent.click(chip("⌘ Cmd"));
    expect(latest?.param1).toBe(0x0a070017);
  });

  it("arrow and navigation keys take modifiers without opening a tab", () => {
    render(<Harness />);
    fireEvent.click(chip("Ctrl"));
    fireEvent.click(chip("Shift"));
    fireEvent.click(chip("←"));
    expect(latest?.param1).toBe(0x03070050);
    fireEvent.click(chip("PageDown"));
    expect(latest?.param1).toBe(0x0307004e);
  });

  it("the ろ key can be picked from the Japanese tab with a modifier", () => {
    render(<Harness />);
    fireEvent.click(chip("Alt"));
    fireEvent.click(screen.getByRole("button", { name: "日本語" }));
    fireEvent.click(screen.getByRole("button", { name: /^ろ/ }));
    expect(latest?.param1).toBe(0x04070087);
    expect(result()).toBe("Alt+ろ");
  });

  it("marks the frequent key that is currently set", () => {
    render(<Harness initial={{ behaviorId: KEY_PRESS, param1: ALT_ENTER, param2: 0 }} />);
    expect(chip("Enter")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Tab")).toHaveAttribute("aria-pressed", "false");
  });

  it("stacks several modifiers on one key and can remove one", () => {
    render(<Harness />);
    pickEnter();
    fireEvent.click(chip("Ctrl"));
    fireEvent.click(chip("Shift"));
    fireEvent.click(chip("Alt"));
    expect(latest?.param1).toBe(0x07070028);
    expect(result()).toBe("Ctrl+Shift+Alt+Enter");
    fireEvent.click(chip("Shift"));
    expect(latest?.param1).toBe(0x05070028);
  });

  it("keeps the modifiers when a different key is picked", () => {
    render(<Harness initial={{ behaviorId: KEY_PRESS, param1: ALT_ENTER, param2: 0 }} />);
    fireEvent.click(chip("Tab"));
    expect(latest?.param1).toBe(0x0407002b);
  });

  it("a symbol that needs Shift adds to the chips, in either order", () => {
    render(<Harness />);
    fireEvent.click(chip("Ctrl"));
    fireEvent.click(screen.getByRole("button", { name: "Shift記号" }));
    fireEvent.click(screen.getByRole("button", { name: "!" }));
    expect(latest?.param1).toBe(0x0307001e);
    expect(chip("Ctrl")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Shift")).toHaveAttribute("aria-pressed", "true");
  });

  it("the symbol first, then the chip, gives the same value", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Shift記号" }));
    fireEvent.click(screen.getByRole("button", { name: "!" }));
    fireEvent.click(chip("Ctrl"));
    expect(latest?.param1).toBe(0x0307001e);
  });

  const openShortcuts = (sub: string) => {
    fireEvent.click(chip("ショートカット"));
    fireEvent.click(chip(sub));
  };

  it("a preset with its own modifiers replaces the chips and says so", () => {
    render(<Harness />);
    fireEvent.click(chip("Shift"));
    openShortcuts("編集");
    fireEvent.click(screen.getByRole("button", { name: /^コピー/ }));
    expect(latest?.param1).toBe(0x01070006);
    expect(chip("Shift")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("選んだ内容に合わせて、修飾キーを切り替えました。")).toBeInTheDocument();
  });

  it("a preset without modifiers stays exactly as labelled", () => {
    render(<Harness initial={{ behaviorId: KEY_PRESS, param1: 0x01070006, param2: 0 }} />);
    openShortcuts("ウィンドウ");
    fireEvent.click(screen.getByRole("button", { name: /^全画面/ }));
    expect(latest?.param1).toBe(0x00070044);
    expect(screen.getByText("選んだ内容に合わせて、修飾キーを外しました。")).toBeInTheDocument();
  });

  it("a media key does not take the chips", () => {
    render(<Harness />);
    fireEvent.click(chip("Alt"));
    openShortcuts("メディア");
    fireEvent.click(screen.getByRole("button", { name: /^音量を上げる/ }));
    expect(latest?.param1).toBe(0x000c00e9);
  });

  it("a bare modifier key does not take the chips", () => {
    render(<Harness />);
    fireEvent.click(chip("Ctrl"));
    fireEvent.click(chip("修飾キー"));
    fireEvent.click(screen.getByRole("button", { name: /Shift \(左\)/ }));
    fireEvent.click(chip("適用する"));
    expect(latest?.param1).toBe(0x000700e1);
  });

  it("clearing a top-bit modifier round trip leaves an unsigned, unchanged value", () => {
    const stored = { behaviorId: KEY_PRESS, param1: 0x80070028, param2: 0 };
    render(<Harness initial={stored} />);
    fireEvent.click(chip("Ctrl"));
    fireEvent.click(chip("Ctrl"));
    expect(latest).toEqual(stored);
  });

  it("shows the waiting state until a key is chosen", () => {
    render(<Harness />);
    fireEvent.click(chip("Alt"));
    expect(result()).toBe("Alt+キー未選択");
    expect(latest).toBeNull();
  });

  it("a modifier clicked while a layer action is set waits for a key and leaves the layer alone", () => {
    const layer = { behaviorId: MOMENTARY_LAYER, param1: 1, param2: 0 };
    render(<Harness initial={layer} />);
    fireEvent.click(chip("Alt"));
    expect(latest).toEqual(layer);
    expect(result()).toBe("Alt+キー未選択");
    pickEnter();
    expect(latest?.param1).toBe(ALT_ENTER);
  });

  it("keeps a right-hand modifier that the chips do not show", () => {
    render(<Harness initial={{ behaviorId: KEY_PRESS, param1: 0x40070028, param2: 0 }} />);
    fireEvent.click(chip("Ctrl"));
    expect((latest?.param1 ?? 0) >>> 24).toBe(0x41);
    expect(result()).toBe("Ctrl+右Alt+Enter");
  });

  it("names the keys for the chosen OS", () => {
    os.mode = "mac";
    render(<Harness />);
    expect(chip("⌘ Cmd")).toBeInTheDocument();
    expect(chip("⌥ Option")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Win" })).not.toBeInTheDocument();
  });
});

describe("comboShortcutLabel", () => {
  it("names [ ] and # as picked, not by their Shift glyph", () => {
    expect(comboShortcutLabel(0x0107002f, "windows")).toBe("Ctrl + [");
    expect(comboShortcutLabel(0x01070030, "windows")).toBe("Ctrl + ]");
  });
  it("names a right-hand Win flag held in the top bit", () => {
    expect(comboShortcutLabel((0x80 << 24) | ENTER, "windows")).toBe("右Win + Enter");
  });
  it("gives Japanese keys their Japanese names", () => {
    expect(comboShortcutLabel(0x04070087, "windows")).toBe("Alt + ろ");
    expect(comboShortcutLabel(0x0007008a, "windows")).toBe("変換");
  });
  it("uses OS names instead of Mac symbols on Windows", () => {
    expect(comboShortcutLabel(ALT_ENTER, "windows")).toBe("Alt + Enter");
    expect(comboShortcutLabel(ALT_ENTER, "mac")).toBe("⌥ Option + Enter");
  });
});
