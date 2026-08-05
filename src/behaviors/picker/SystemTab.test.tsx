import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { SystemTab } from "./SystemTab";

const bluetoothMetadata = [
  {
    param1: [
      { name: "Clear", constant: 0 },
      { name: "Next", constant: 1 },
      { name: "Previous", constant: 2 },
    ],
    param2: [],
  },
  {
    param1: [
      { name: "Select Profile", constant: 3 },
      { name: "Disconnect Profile", constant: 5 },
    ],
    param2: [{ name: "Profile", range: { min: 0, max: 3 } }],
  },
];

const mockBehaviors: GetBehaviorDetailsResponse[] = [
  { id: 30, displayName: "None", metadata: [] },
  { id: 31, displayName: "Transparent", metadata: [] },
  { id: 32, displayName: "Bluetooth", metadata: bluetoothMetadata },
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

  it("renders Bluetooth profiles from a 0 through 3 metadata range", () => {
    const onApply = vi.fn();
    render(<SystemTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    for (const profile of [0, 1, 2, 3]) {
      expect(screen.getByText(`BT プロファイル ${profile}`)).toBeTruthy();
    }
    expect(screen.queryByText("BT プロファイル 4")).toBeNull();
  });

  it("renders only Bluetooth profiles included in a smaller metadata range", () => {
    const onApply = vi.fn();
    const behaviors = mockBehaviors.map((behavior) =>
      behavior.displayName === "Bluetooth"
        ? {
            ...behavior,
            metadata: [
              ...bluetoothMetadata.slice(0, 1),
              {
                ...bluetoothMetadata[1],
                param2: [{ name: "Profile", range: { min: 0, max: 1 } }],
              },
            ],
          }
        : behavior,
    );
    render(<SystemTab behaviors={behaviors} onApplyBinding={onApply} />);
    expect(screen.getByText("BT プロファイル 0")).toBeTruthy();
    expect(screen.getByText("BT プロファイル 1")).toBeTruthy();
    expect(screen.queryByText("BT プロファイル 2")).toBeNull();
  });

  it("renders no Bluetooth profiles when metadata has no range", () => {
    const onApply = vi.fn();
    const behaviors = mockBehaviors.map((behavior) =>
      behavior.displayName === "Bluetooth" ? { ...behavior, metadata: [] } : behavior,
    );
    render(<SystemTab behaviors={behaviors} onApplyBinding={onApply} />);
    expect(screen.getByText("BT クリア")).toBeTruthy();
    expect(screen.queryAllByText(/BT プロファイル/)).toHaveLength(0);
  });

  it("BT operation: click to apply with param1", () => {
    const onApply = vi.fn();
    render(<SystemTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("BT 次へ"));
    expect(onApply).toHaveBeenCalledWith({ behaviorId: 32, param1: 1, param2: 0 });
  });

  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ])("BT プロファイル %i: click to apply BT_SEL with profile %i", (profile, expectedParam2) => {
    const onApply = vi.fn();
    render(<SystemTab behaviors={mockBehaviors} onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText(`BT プロファイル ${profile}`));
    expect(onApply).toHaveBeenCalledWith({ behaviorId: 32, param1: 3, param2: expectedParam2 });
  });
});
