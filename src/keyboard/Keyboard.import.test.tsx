import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";

const mocks = vi.hoisted(() => ({
  callRpc: vi.fn(),
  openFilePicker: vi.fn(),
  deserializeKeymap: vi.fn(),
  calculateImportChanges: vi.fn(),
  calculateUnappliedLayerCount: vi.fn(),
  toast: vi.fn(),
  setKeymap: vi.fn(),
}));

vi.mock("../rpc/logging", () => ({ call_rpc: mocks.callRpc }));
vi.mock("@zmkfirmware/zmk-studio-ts-client/core", () => ({
  LockState: { ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED: 1 },
}));
vi.mock("@zmkfirmware/zmk-studio-ts-client/keymap", () => ({
  SetLayerBindingResponse: { SET_LAYER_BINDING_RESP_OK: 0 },
  SetLayerPropsResponse: { SET_LAYER_PROPS_RESP_OK: 0 },
}));
vi.mock("../rpc/useConnectedDeviceData", () => ({
  useConnectedDeviceData: () => [currentKeymap, mocks.setKeymap, false, vi.fn()],
}));
vi.mock("../behaviors/BehaviorsContext", () => ({
  useBehaviorMap: () => ({ 1: { id: 1, displayName: "Key Press" } }),
  useBehaviorsLoading: () => false,
  useBehaviorsStatus: () => ({ error: false, reload: vi.fn() }),
}));
vi.mock("../misc/Toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("../telemetry/TelemetryProvider", () => ({ useTelemetry: () => ({ trackKeymap: vi.fn() }) }));
vi.mock("../usePubSub", () => ({ useSub: () => {} }));
vi.mock("../OsModeContext", () => ({ useOsMode: () => ({ osMode: "mac" }) }));
vi.mock("./useEncoderBindings", () => ({ useEncoderBindings: () => undefined }));
vi.mock("./LayerPicker", () => ({ LayerPicker: () => null }));
vi.mock("./PhysicalLayoutPicker", () => ({ PhysicalLayoutPicker: () => null }));
vi.mock("./Keymap", () => ({ Keymap: () => null }));
vi.mock("../behaviors/BehaviorBindingPicker", () => ({ BehaviorBindingPicker: () => null }));
vi.mock("./ModifierPanel", () => ({ ModifierPanel: () => null }));
vi.mock("../trackball/AutoMouseLayerControl", () => ({ AutoMouseLayerControl: () => null }));
vi.mock("./keymap-io", () => ({
  openFilePicker: mocks.openFilePicker,
  deserializeKeymap: mocks.deserializeKeymap,
  serializeKeymap: vi.fn(),
  downloadJson: vi.fn(),
}));
vi.mock("./import-diff", () => ({
  calculateImportChanges: mocks.calculateImportChanges,
  calculateUnappliedLayerCount: mocks.calculateUnappliedLayerCount,
}));
vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    cancelLabel = "キャンセル",
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => open ? (
    <div role="dialog" aria-label={title}>
      <button onClick={onCancel}>{cancelLabel}</button>
      <button onClick={onConfirm}>{confirmLabel}</button>
    </div>
  ) : null,
}));

import Keyboard from "./Keyboard";

const currentKeymap = {
  layers: [{ id: 10, name: "Base", bindings: [{ behaviorId: 1, param1: 0, param2: 0 }] }],
  availableLayers: 0,
  maxLayerNameLength: 20,
};
const importedLayers = [{ name: "Imported", bindings: [{ behaviorId: 1, param1: 1, param2: 0 }] }];

beforeAll(() => {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
    },
  });
});

beforeEach(() => {
  mocks.callRpc.mockReset();
  mocks.openFilePicker.mockReset();
  mocks.deserializeKeymap.mockReset();
  mocks.calculateImportChanges.mockReset();
  mocks.calculateUnappliedLayerCount.mockReset();
  mocks.toast.mockReset();
  mocks.setKeymap.mockReset();
  mocks.callRpc.mockResolvedValue({ keymap: { getPhysicalLayouts: { layouts: [{ keys: [{}] }], activeLayoutIndex: 0 } } });
  mocks.openFilePicker.mockResolvedValue('{"keymap":"import"}');
  mocks.deserializeKeymap.mockReturnValue({ ok: true, layers: importedLayers });
  mocks.calculateImportChanges.mockReturnValue({
    layerProps: [],
    bindings: [{ layerId: 10, keyPosition: 0, binding: importedLayers[0].bindings[0] }],
  });
  mocks.calculateUnappliedLayerCount.mockReturnValue(0);
  vi.spyOn(window, "confirm").mockReturnValue(false);
});

async function renderKeyboard() {
  render(
    <ConnectionContext.Provider value={{ conn: {} as never }}>
      <LockStateContext.Provider value={1 as never}>
        <Keyboard />
      </LockStateContext.Provider>
    </ConnectionContext.Provider>
  );
  await screen.findByRole("button", { name: "読込" });
  mocks.callRpc.mockClear();
}

describe("Keyboard import", () => {
  it("does not write after choosing a file or cancelling, and starts writing only after confirmation", async () => {
    await renderKeyboard();

    fireEvent.click(screen.getByRole("button", { name: "読込" }));
    await waitFor(() => expect(mocks.openFilePicker).toHaveBeenCalledOnce());

    expect(mocks.callRpc).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "キーマップをインポート" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(mocks.callRpc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "読込" }));
    await screen.findByRole("dialog", { name: "キーマップをインポート" });
    fireEvent.click(screen.getByRole("button", { name: "インポートする" }));

    await waitFor(() => {
      expect(mocks.callRpc).toHaveBeenCalledWith(
        {},
        { keymap: { setLayerBinding: { layerId: 10, keyPosition: 0, binding: importedLayers[0].bindings[0] } } }
      );
    });
  });
});
