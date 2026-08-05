import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { Layer } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { LayerPicker } from "./LayerPicker";

const layers: Layer[] = [
  { id: 0, name: "Base", bindings: [] },
  { id: 1, name: "Nav", bindings: [] },
];

// Deleting or reordering a layer shifts the indices of every layer after it,
// which silently repoints the layer references we persist on the keyboard.
// Keyboard.tsx keeps both controls off until those settings move to layer ids;
// these tests pin down that the props actually take the controls away, and the
// "with the controls on" cases prove the assertions can see them when present.
describe("LayerPicker layer-order controls", () => {
  it("drops the remove button when no remove handler is given", () => {
    const { container } = render(
      <LayerPicker layers={layers} selectedLayerIndex={0} canRemove canAdd />
    );

    expect(container.querySelector(".lucide-minus")).toBeNull();
  });

  it("shows the remove button when a remove handler is given", () => {
    const { container } = render(
      <LayerPicker
        layers={layers}
        selectedLayerIndex={0}
        canRemove
        canAdd
        onRemoveClicked={() => {}}
      />
    );

    expect(container.querySelector(".lucide-minus")).not.toBeNull();
  });

  it("makes no layer draggable when reordering is off", () => {
    const { container } = render(
      <LayerPicker
        layers={layers}
        selectedLayerIndex={0}
        canReorder={false}
        onLayerMoved={() => {}}
      />
    );

    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0);
  });

  it("makes every layer draggable when reordering is on", () => {
    const { container } = render(
      <LayerPicker
        layers={layers}
        selectedLayerIndex={0}
        canReorder
        onLayerMoved={() => {}}
      />
    );

    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(
      layers.length
    );
  });

  it("drops the add button when no add handler is given", () => {
    const { container } = render(
      <LayerPicker layers={layers} selectedLayerIndex={0} canAdd canReorder={false} />
    );

    expect(container.querySelector(".lucide-plus")).toBeNull();
  });

  it("shows the add button when an add handler is given", () => {
    const { container } = render(
      <LayerPicker
        layers={layers}
        selectedLayerIndex={0}
        canAdd
        canReorder={false}
        onAddClicked={() => {}}
      />
    );

    expect(container.querySelector(".lucide-plus")).not.toBeNull();
  });
});
