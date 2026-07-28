import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const callRPC = vi.fn();
let notificationHandler: ((payload: Uint8Array) => void) | undefined;
let notification = { inputProcessorChanged: null as ReturnType<typeof processor> | null };

const subsystem = {
  subsystemIndex: 1,
  callRPC,
};

vi.mock("../rpc/useCustomSubsystem", () => ({
  useCustomNotification: (_index: number | undefined, handler: (payload: Uint8Array) => void) => {
    notificationHandler = handler;
  },
  useCustomSubsystem: () => subsystem,
}));
vi.mock("../rpc/useLayers", () => ({
  useLayers: () => [
    { id: 4, index: 4, name: "ナビゲーション" },
    { id: 6, index: 6, name: "マウス" },
  ],
}));
vi.mock("../misc/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../proto/rip", () => ({
  SUBSYSTEM_ID: "cormoran_rip",
  decodeNotification: () => notification,
  encodeListInputProcessors: () => "list",
  encodeSetTempLayerEnabled: () => "enabled",
  encodeSetTempLayerLayer: () => "layer",
  encodeSetTempLayerActivationDelay: (_id: number, delay: number) => `activation:${delay}`,
  encodeSetTempLayerDeactivationDelay: (_id: number, delay: number) => `deactivation:${delay}`,
}));

import { AutoMouseLayerControl, AutoMouseLayerControlView } from "./AutoMouseLayerControl";

const layers = [
  { id: 4, index: 4, name: "ナビゲーション" },
  { id: 6, index: 6, name: "マウス" },
];

function processor() {
  return {
    id: 1,
    name: "Trackball",
    scaleMultiplier: 1,
    scaleDivisor: 1,
    rotationDegrees: 0,
    tempLayerEnabled: true,
    tempLayerLayer: 6,
    tempLayerActivationDelayMs: 100,
    tempLayerDeactivationDelayMs: 500,
    activeLayers: 0,
    axisSnapMode: 0,
    axisSnapThreshold: 0,
    axisSnapTimeoutMs: 0,
    xyToScrollEnabled: false,
    xySwapEnabled: false,
    xInvert: false,
    yInvert: false,
  };
}

function renderView(overrides = {}) {
  const onEnabledChange = vi.fn();
  const onLayerChange = vi.fn();
  const onActivationDelayChange = vi.fn();
  const onDeactivationDelayChange = vi.fn();

  render(
    <AutoMouseLayerControlView
      enabled={false}
      layerId={6}
      layers={layers}
      activationDelayMs={100}
      deactivationDelayMs={500}
      onEnabledChange={onEnabledChange}
      onLayerChange={onLayerChange}
      onActivationDelayChange={onActivationDelayChange}
      onDeactivationDelayChange={onDeactivationDelayChange}
      onActivationDelayCommit={() => {}}
      onDeactivationDelayCommit={() => {}}
      {...overrides}
    />
  );

  return { onEnabledChange, onLayerChange, onActivationDelayChange, onDeactivationDelayChange };
}

async function renderConnectedControl() {
  callRPC.mockResolvedValue(undefined);
  render(<AutoMouseLayerControl />);
  await act(async () => {
    notification = { inputProcessorChanged: processor() };
    notificationHandler?.(new Uint8Array());
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  notificationHandler = undefined;
  notification = { inputProcessorChanged: null };
});

describe("AutoMouseLayerControlView", () => {
  it("スイッチ操作で変更を通知する", () => {
    const { onEnabledChange } = renderView();

    fireEvent.click(screen.getByRole("switch"));

    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("OFF のときレイヤー選択とスライダーを操作できない", () => {
    renderView();

    expect(screen.getByLabelText("切り替えるレイヤー")).toBeDisabled();
    expect(screen.getByLabelText("切り替わるまでの時間")).toBeDisabled();
    expect(screen.getByLabelText("もとに戻るまでの時間")).toBeDisabled();
  });

  it("既定の遅延値を表示する", () => {
    renderView({ enabled: true });

    expect(screen.getByText("100 ms")).toBeTruthy();
    expect(screen.getByText("500 ms")).toBeTruthy();
  });

  it("切り替わるまでを2000msまで設定できる", () => {
    renderView({ enabled: true, activationDelayMs: 2000 });

    expect(screen.getByLabelText("切り替わるまでの時間")).toHaveAttribute("max", "2000");
  });

  it("レイヤーが空でも読み込み表示を壊さない", () => {
    renderView({ layers: [] });

    expect(screen.getByText("レイヤーを読み込んでいます…")).toBeTruthy();
  });
});

describe("AutoMouseLayerControl", () => {
  it("スライダー操作の直後には遅延設定を送信しない", async () => {
    vi.useFakeTimers();
    await renderConnectedControl();

    fireEvent.change(screen.getByLabelText("切り替わるまでの時間"), { target: { value: "200" } });

    expect(callRPC).toHaveBeenCalledTimes(1);
    expect(screen.getByText("200 ms")).toBeTruthy();
  });

  it("スライダー停止から300ms後に遅延設定を一度だけ送信する", async () => {
    vi.useFakeTimers();
    await renderConnectedControl();

    fireEvent.change(screen.getByLabelText("切り替わるまでの時間"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("切り替わるまでの時間"), { target: { value: "300" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(callRPC).toHaveBeenCalledTimes(2);
    expect(callRPC).toHaveBeenLastCalledWith("activation:300");
  });
});
