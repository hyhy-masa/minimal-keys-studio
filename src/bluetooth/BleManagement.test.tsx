import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
  replacementCallRPC: vi.fn(),
  toast: vi.fn(),
  subsystem: {
    subsystemIndex: 1,
    callRPC: (...args: unknown[]) => mocks.callRPC(...args),
  },
  replacementSubsystem: {
    subsystemIndex: 2,
    callRPC: (...args: unknown[]) => mocks.replacementCallRPC(...args),
  },
  currentSubsystem: undefined as unknown,
  lastConfirm: undefined as (() => void) | undefined,
}));

const profile = {
  index: 7,
  name: "Masakazu",
  address: "AA:BB:CC:DD",
  isConnected: true,
  isOpen: false,
  isActive: false,
};

vi.mock("../rpc/useCustomSubsystem", () => ({
  useCustomSubsystem: () => mocks.currentSubsystem,
}));

vi.mock("../misc/Toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
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
  }) => {
    if (!open) return null;
    mocks.lastConfirm = onConfirm;
    return (
      <div role="dialog" aria-label={title}>
        <button onClick={onCancel}>{cancelLabel}</button>
        <button onClick={onConfirm}>{confirmLabel}</button>
      </div>
    );
  },
}));

vi.mock("../proto/ble", () => ({
  SUBSYSTEM_ID: "cormoran_ble",
  OutputPriority: { USB: 0, BLE: 1 },
  encodeGetProfiles: () => "get-profiles",
  encodeGetSplitInfo: () => "get-split-info",
  encodeGetOutputPriority: () => "get-output-priority",
  encodeUnpairProfile: (index: number) => `unpair:${index}`,
  encodeSwitchProfile: (index: number) => `switch:${index}`,
  encodeSetProfileName: (index: number, name: string) => `name:${index}:${name}`,
  encodeSetOutputPriority: (priority: number) => `priority:${priority}`,
  decodeResponse: (response: object) => response,
}));

import { BleManagement } from "./BleManagement";

function responseFor(request: string) {
  switch (request) {
    case "get-profiles":
      return { getProfiles: { profiles: [profile], maxProfiles: 5 } };
    case "get-split-info":
      return { getSplitInfo: { isSplit: false, isCentral: true, peripheralConnected: true } };
    case "get-output-priority":
      return { getOutputPriority: 0 };
    default:
      return {};
  }
}

async function renderManagement() {
  const view = render(<BleManagement />);
  await screen.findByRole("button", { name: "ペアリング解除" });
  mocks.callRPC.mockClear();
  return view;
}

beforeEach(() => {
  mocks.currentSubsystem = mocks.subsystem;
  mocks.callRPC.mockImplementation((request: string) => Promise.resolve(responseFor(request)));
  mocks.replacementCallRPC.mockImplementation((request: string) => Promise.resolve(responseFor(request)));
  mocks.lastConfirm = undefined;
  vi.spyOn(window, "confirm").mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("BleManagement", () => {
  it("waits for confirmation before unpairing and leaves the profile unchanged after cancellation", async () => {
    await renderManagement();

    fireEvent.click(screen.getByRole("button", { name: "ペアリング解除" }));

    expect(mocks.callRPC).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Bluetoothプロファイルを解除" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(mocks.callRPC).not.toHaveBeenCalled();
  });

  it("sends one unpair RPC for the selected profile even when confirmation is clicked twice", async () => {
    await renderManagement();

    fireEvent.click(screen.getByRole("button", { name: "ペアリング解除" }));
    const confirm = screen.getByRole("button", { name: "解除する" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(mocks.callRPC).toHaveBeenCalledWith("unpair:7");
    });
    expect(mocks.callRPC.mock.calls.filter(([request]) => request === "unpair:7")).toHaveLength(1);
  });

  it("does not unpair through a subsystem that changed after the confirmation opened", async () => {
    const { rerender } = await renderManagement();

    fireEvent.click(screen.getByRole("button", { name: "ペアリング解除" }));
    mocks.currentSubsystem = mocks.replacementSubsystem;
    rerender(<BleManagement />);
    const confirm = mocks.lastConfirm;
    expect(confirm).toBeTypeOf("function");

    await confirm!();

    expect(mocks.callRPC).not.toHaveBeenCalledWith("unpair:7");
    expect(mocks.replacementCallRPC).not.toHaveBeenCalledWith("unpair:7");
  });
});
