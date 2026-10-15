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
  forceDisconnect: vi.fn(),
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

vi.mock("../rpc/logging", () => {
  class RpcTimeoutError extends Error {}
  class RpcWriteTimeoutError extends RpcTimeoutError {}
  return {
    RpcTimeoutError,
    RpcWriteTimeoutError,
    forceDisconnect: (...args: unknown[]) => mocks.forceDisconnect(...args),
  };
});

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

import type { ReactNode } from "react";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { RpcTimeoutError, RpcWriteTimeoutError } from "../rpc/logging";
import { BleManagement } from "./BleManagement";

const fakeConn = {} as RpcConnection;

function ConnectionWrapper({ children }: { children: ReactNode }) {
  return (
    <ConnectionContext.Provider value={{ conn: fakeConn }}>{children}</ConnectionContext.Provider>
  );
}

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

async function renderManagement(props: { isWireless?: boolean } = {}) {
  const view = render(<BleManagement {...props} />, { wrapper: ConnectionWrapper });
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

  it("disconnects with a reconnect notice when switching the output times out", async () => {
    await renderManagement();
    mocks.callRPC.mockRejectedValueOnce(new RpcTimeoutError());

    fireEvent.click(screen.getByRole("button", { name: "BLE" }));

    await waitFor(() => {
      expect(mocks.forceDisconnect).toHaveBeenCalledTimes(1);
    });
    const [conn, notice] = mocks.forceDisconnect.mock.calls[0];
    expect(conn).toBe(fakeConn);
    expect(notice).toContain("出力先をBLEに切り替えました");
    expect(notice).toContain("「ワイヤレスでつなぐ」");
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.anything(), "error");
  });

  it("shows an error instead of disconnecting when re-selecting the current output times out", async () => {
    await renderManagement();
    mocks.callRPC.mockRejectedValueOnce(new RpcTimeoutError());

    fireEvent.click(screen.getByRole("button", { name: "USB" }));

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        "出力先を切り替えられませんでした。もう一度お試しください",
        "error"
      );
    });
    expect(mocks.forceDisconnect).not.toHaveBeenCalled();
  });

  it("shows an error instead of disconnecting when switching the output fails without a timeout", async () => {
    await renderManagement();
    mocks.callRPC.mockRejectedValueOnce(new Error("boom"));

    fireEvent.click(screen.getByRole("button", { name: "BLE" }));

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        "出力先を切り替えられませんでした。もう一度お試しください",
        "error"
      );
    });
    expect(mocks.forceDisconnect).not.toHaveBeenCalled();
  });

  it("tells a wireless user to reconnect over USB when switching the output to USB times out", async () => {
    await renderManagement({ isWireless: true });
    mocks.callRPC.mockRejectedValueOnce(new RpcTimeoutError());

    fireEvent.click(screen.getByRole("button", { name: "USB" }));

    await waitFor(() => {
      expect(mocks.forceDisconnect).toHaveBeenCalledTimes(1);
    });
    const [, notice] = mocks.forceDisconnect.mock.calls[0];
    expect(notice).toContain("出力先をUSBに切り替えました");
    expect(notice).toContain("「USBでつなぐ」");
  });

  it("keeps a USB connection and shows an error when re-selecting USB over USB times out", async () => {
    // The displayed output stays USB here, as when loading the current output failed.
    await renderManagement({ isWireless: false });
    mocks.callRPC.mockRejectedValueOnce(new RpcTimeoutError());

    fireEvent.click(screen.getByRole("button", { name: "USB" }));

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        "出力先を切り替えられませんでした。もう一度お試しください",
        "error"
      );
    });
    expect(mocks.forceDisconnect).not.toHaveBeenCalled();
  });

  it("adds nothing when the request could not be written, because the RPC layer already disconnected", async () => {
    await renderManagement({ isWireless: true });
    mocks.callRPC.mockRejectedValueOnce(new RpcWriteTimeoutError());

    fireEvent.click(screen.getByRole("button", { name: "USB" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "USB" }).hasAttribute("disabled")).toBe(false);
    });
    expect(mocks.forceDisconnect).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("disables the output buttons and ignores presses while a switch waits for a reply", async () => {
    await renderManagement();
    let resolveSwitch!: (value: unknown) => void;
    mocks.callRPC.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSwitch = resolve; })
    );

    fireEvent.click(screen.getByRole("button", { name: "BLE" }));
    fireEvent.click(screen.getByRole("button", { name: "BLE" }));
    fireEvent.click(screen.getByRole("button", { name: "USB" }));

    expect(mocks.callRPC).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("切り替え中…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "USB" }).hasAttribute("disabled")).toBe(true);

    resolveSwitch({});
    await waitFor(() => {
      expect(screen.queryByText("切り替え中…")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "USB" }));
    expect(mocks.callRPC).toHaveBeenCalledTimes(2);
  });
});
