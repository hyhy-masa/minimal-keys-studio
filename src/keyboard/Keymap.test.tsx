import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { Keymap as KeymapMsg, PhysicalLayout } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { Keymap } from "./Keymap";

const bluetoothBehavior: GetBehaviorDetailsResponse = {
  id: 32,
  displayName: "Bluetooth",
  metadata: [],
};

const bluetoothBindings = [
  { behaviorId: 32, param1: 0, param2: 0 },
  { behaviorId: 32, param1: 1, param2: 0 },
  { behaviorId: 32, param1: 2, param2: 0 },
  { behaviorId: 32, param1: 3, param2: 0 },
  { behaviorId: 32, param1: 3, param2: 1 },
  { behaviorId: 32, param1: 3, param2: 2 },
  { behaviorId: 32, param1: 3, param2: 3 },
  { behaviorId: 32, param1: 3, param2: 4 },
  { behaviorId: 32, param1: 4, param2: 0 },
  { behaviorId: 32, param1: 99, param2: 0 },
];

const layout: PhysicalLayout = {
  name: "test",
  keys: bluetoothBindings.map((_, index) => ({
    width: 100,
    height: 100,
    x: index * 100,
    y: 0,
    r: 0,
    rx: 0,
    ry: 0,
  })),
};

const keymap: KeymapMsg = {
  layers: [{ id: 0, name: "Base", bindings: bluetoothBindings }],
  availableLayers: 1,
  maxLayerNameLength: 16,
};

describe("Keymap Bluetooth keycaps", () => {
  it("gives every Bluetooth command and profile a distinct keycap label", () => {
    render(
      <Keymap
        layout={layout}
        keymap={keymap}
        behaviors={{ 32: bluetoothBehavior }}
        oneU={48}
        selectedLayerIndex={0}
        selectedKeyPosition={undefined}
        onKeyPositionClicked={() => {}}
      />,
    );

    const labels = screen.getAllByRole("button").map((button) => button.textContent);

    expect(labels).toEqual([
      "BTCLR",
      "BTNXT",
      "BTPRV",
      "BT0",
      "BT1",
      "BT2",
      "BT3",
      "BT4",
      "BTALL",
      "BT?99",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
