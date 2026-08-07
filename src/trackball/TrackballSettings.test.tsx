import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { callRPC, encodeSetActiveLayers, encodeSetScrollLayers } = vi.hoisted(() => ({
  callRPC: vi.fn(),
  encodeSetActiveLayers: vi.fn((_id: number, layers: number) =>
    `active-layers:${layers}`
  ),
  encodeSetScrollLayers: vi.fn((_id: number, layers: number) =>
    `scroll-layers:${layers}`
  ),
}));
let notificationHandler: ((payload: Uint8Array) => void) | undefined;
let notification = {
  inputProcessorChanged: null as ReturnType<typeof processor> | null,
};

const subsystem = {
  subsystemIndex: 1,
  callRPC,
};

vi.mock("../rpc/useCustomSubsystem", () => ({
  useCustomNotification: (
    _index: number | undefined,
    handler: (payload: Uint8Array) => void
  ) => {
    notificationHandler = handler;
  },
  useCustomSubsystem: () => subsystem,
}));

vi.mock("../rpc/useLayers", () => ({
  useLayers: () => [
    { id: 0, index: 0, name: "ベース" },
    { id: 9, index: 4, name: "レイヤー4" },
  ],
}));

vi.mock("../misc/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../ConfirmDialog", () => ({ ConfirmDialog: () => null }));

vi.mock("../proto/rip", () => ({
  SUBSYSTEM_ID: "cormoran_rip",
  decodeNotification: () => notification,
  encodeListInputProcessors: () => "list",
  encodeSetActiveLayers,
  encodeSetScrollLayers,
}));

import { TrackballSettings } from "./TrackballSettings";

function processor(activeLayers = 0, scrollLayers = 0) {
  return {
    id: 1,
    name: "Trackball",
    scaleMultiplier: 1,
    scaleDivisor: 1,
    rotationDegrees: 0,
    tempLayerEnabled: false,
    tempLayerLayer: 0,
    tempLayerActivationDelayMs: 0,
    tempLayerDeactivationDelayMs: 0,
    activeLayers,
    scrollLayers,
    axisSnapMode: 0,
    axisSnapThreshold: 0,
    axisSnapTimeoutMs: 0,
    xyToScrollEnabled: false,
    xySwapEnabled: false,
    xInvert: false,
    yInvert: false,
  };
}

async function renderConnectedSettings(activeLayers = 0, scrollLayers = 0) {
  callRPC.mockResolvedValue(undefined);
  render(<TrackballSettings />);

  await act(async () => {
    notification = {
      inputProcessorChanged: processor(activeLayers, scrollLayers),
    };
    notificationHandler?.(new Uint8Array());
  });
}

afterEach(() => {
  vi.clearAllMocks();
  notificationHandler = undefined;
  notification = { inputProcessorChanged: null };
});

describe("TrackballSettings", () => {
  
  
  it("レイヤー4をスクロールするレイヤーに選ぶとビットマスク16を送信する", async () => {
    await renderConnectedSettings();

    fireEvent.click(screen.getByRole("radio", { name: "レイヤー4" }));
    fireEvent.click(screen.getByRole("button", { name: "適用" }));

    await waitFor(() => {
      expect(encodeSetScrollLayers).toHaveBeenCalledWith(1, 16);
    });
    expect(callRPC).toHaveBeenCalledWith("scroll-layers:16", 5000);
  });

  it("スクロールするレイヤーでなしを選ぶと0を送信する", async () => {
    await renderConnectedSettings(0, 16);

    fireEvent.click(
      screen.getByRole("radio", {
        name: "なし（スクロールモードを使わない）",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "適用" }));

    await waitFor(() => {
      expect(encodeSetScrollLayers).toHaveBeenCalledWith(1, 0);
    });
    expect(callRPC).toHaveBeenCalledWith("scroll-layers:0", 5000);
  });

  it("複数のスクロールレイヤーは選択済みにせず置換を案内する", async () => {
    await renderConnectedSettings(0, 17);

    expect(
      screen.getByText(
        "現在は複数のレイヤーが設定されています。1つ選ぶと置き換わります"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "なし（スクロールモードを使わない）" })
    ).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "ベース" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "レイヤー4" })).not.toBeChecked();
  });

  // The active-layers picker is gone on purpose. It could only switch the whole
  // processor off per layer — never hold per-layer settings — so a customer who
  // touched it silently lost rotation, XY-to-scroll and the auto-mouse layer
  // everywhere else while the screen still looked correct.
  it("トラックボール設定を有効にするレイヤーの選択は出さない", async () => {
    await renderConnectedSettings();

    expect(screen.queryByText(/有効にするレイヤー/)).toBeNull();
    expect(
      screen.queryByText("選択なしの場合は全レイヤーで有効です。")
    ).toBeNull();
  });

  // The scroll-layer picker lives in the same tab and must survive the removal,
  // so a passing suite means "that one is gone" rather than "the tab is empty".
  it("スクロールするレイヤーの選択は残っている", async () => {
    await renderConnectedSettings();

    expect(screen.getByText("スクロールするレイヤー")).toBeInTheDocument();
  });
});
