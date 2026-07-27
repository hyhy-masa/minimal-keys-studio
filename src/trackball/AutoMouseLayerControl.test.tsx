import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../rpc/useCustomSubsystem", () => ({
  useCustomNotification: () => {},
  useCustomSubsystem: () => null,
}));
vi.mock("../rpc/useLayers", () => ({ useLayers: () => [] }));
vi.mock("../misc/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../proto/rip", () => ({ SUBSYSTEM_ID: "cormoran_rip" }));

import { AutoMouseLayerControlView } from "./AutoMouseLayerControl";

const layers = [
  { id: 4, index: 4, name: "ナビゲーション" },
  { id: 6, index: 6, name: "マウス" },
];

function renderControl(overrides = {}) {
  const onEnabledChange = vi.fn();
  const onLayerChange = vi.fn();

  render(
    <AutoMouseLayerControlView
      enabled={false}
      layerId={6}
      layers={layers}
      onEnabledChange={onEnabledChange}
      onLayerChange={onLayerChange}
      {...overrides}
    />
  );

  return { onEnabledChange, onLayerChange };
}

describe("AutoMouseLayerControlView", () => {
  it("スイッチ操作で変更を通知する", () => {
    const { onEnabledChange } = renderControl();

    fireEvent.click(screen.getByRole("switch"));

    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("OFF のときレイヤー選択を操作できない", () => {
    renderControl();

    expect(screen.getByLabelText("切り替えるレイヤー")).toBeDisabled();
  });

  it("レイヤーが空でも読み込み表示を壊さない", () => {
    renderControl({ layers: [] });

    expect(screen.getByText("レイヤーを読み込んでいます…")).toBeTruthy();
  });
});
