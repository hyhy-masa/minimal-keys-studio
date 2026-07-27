import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AutoMouseLayerSection } from "./AutoMouseLayerSection";

const layers = [
  { id: 4, index: 4, name: "ナビゲーション" },
  { id: 6, index: 6, name: "マウス" },
];

function renderSection(overrides = {}) {
  const onEnabledChange = vi.fn();
  const onLayerChange = vi.fn();

  render(
    <AutoMouseLayerSection
      enabled={false}
      onEnabledChange={onEnabledChange}
      layerId={6}
      onLayerChange={onLayerChange}
      layers={layers}
      {...overrides}
    />
  );

  return { onEnabledChange, onLayerChange };
}

describe("AutoMouseLayerSection", () => {
  it("スイッチを操作すると反転した値を通知する", () => {
    const { onEnabledChange } = renderSection();

    fireEvent.click(screen.getByRole("switch"));

    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("対象レイヤーを選ぶと選択した id を通知する", () => {
    const { onLayerChange } = renderSection({ enabled: true });

    fireEvent.change(screen.getByLabelText("切り替えるレイヤー"), {
      target: { value: "4" },
    });

    expect(onLayerChange).toHaveBeenCalledWith(4);
  });

  it("無効のときも対象レイヤーを表示したまま操作できない", () => {
    renderSection();

    expect(screen.getByLabelText("切り替えるレイヤー")).toBeDisabled();
  });

  it("レイヤー未取得でも例外なく読み込み表示する", () => {
    renderSection({ layers: [] });

    expect(screen.getByText("レイヤーを読み込んでいます…")).toBeTruthy();
  });
});
