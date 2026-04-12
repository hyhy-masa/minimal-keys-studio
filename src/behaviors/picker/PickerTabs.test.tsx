import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PickerTabs } from "./PickerTabs";

const fakeBehaviors = [
  { id: 10, displayName: "Key Press", metadata: [] },
  { id: 20, displayName: "Momentary Layer", metadata: [] },
  { id: 30, displayName: "Toggle Layer", metadata: [] },
  { id: 40, displayName: "Sticky Layer", metadata: [] },
];

describe("PickerTabs", () => {
  it("renders six tab buttons and OS mode toggle", () => {
    render(
      <PickerTabs
        keyPosition={37}
        behaviors={fakeBehaviors}
        layers={[{ id: 0, name: "Layer 0" }]}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.getByText("ショートカット")).toBeDefined();
    expect(screen.getByText("文字・記号")).toBeDefined();
    expect(screen.getByText("レイヤー")).toBeDefined();
    expect(screen.getByText("修飾キー")).toBeDefined();
    expect(screen.getByText("日本語")).toBeDefined();
    expect(screen.getByText("システム")).toBeDefined();
    // OS toggle
    expect(screen.getByText("Mac")).toBeDefined();
    expect(screen.getByText("Windows")).toBeDefined();
  });

  it("defaults to ショートカット tab with おすすめ for thumb key", () => {
    render(
      <PickerTabs
        keyPosition={37}
        behaviors={fakeBehaviors}
        layers={[{ id: 0, name: "Layer 0" }]}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.getByText("おすすめ")).toBeDefined();
  });

  it("defaults to ショートカット tab without おすすめ for non-thumb key", () => {
    render(
      <PickerTabs
        keyPosition={9999}
        behaviors={fakeBehaviors}
        layers={[{ id: 0, name: "Layer 0" }]}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.queryByText("おすすめ")).toBeNull();
  });
});
