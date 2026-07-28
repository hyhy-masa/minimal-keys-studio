import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

vi.mock("./connect/autoConnectUsb", () => ({
  AutoConnectError: class AutoConnectError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  },
  autoConnectUsb: vi.fn(),
}));

import { autoConnectUsb } from "./connect/autoConnectUsb";
import { ConnectModal } from "./ConnectModal";
import { ToastProvider } from "./misc/Toast";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConnectModal USB auto-connect", () => {
  const transport = {} as RpcTransport;
  const transports = [{ label: "USB", connect: vi.fn() }];

  it("returns to a retryable failure view when connection establishment fails", async () => {
    vi.mocked(autoConnectUsb).mockResolvedValue({
      transport,
      deviceId: "usb-test",
      deviceLabel: "USB test",
    });
    const onTransportCreated = vi.fn().mockResolvedValue(false);

    render(
      <ConnectModal
        open
        transports={transports}
        onTransportCreated={onTransportCreated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /USBでつなぐ/, hidden: true }));

    await waitFor(() => {
      expect(screen.getByText("接続できませんでした。もう一度お試しください")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /USBでつなぐ/, hidden: true })).toBeEnabled();
  });

  it("passes isWireless=false to connection establishment", async () => {
    vi.mocked(autoConnectUsb).mockResolvedValue({
      transport,
      deviceId: "usb-test",
      deviceLabel: "USB test",
    });
    const onTransportCreated = vi.fn().mockResolvedValue(true);

    render(
      <ConnectModal
        open
        transports={transports}
        onTransportCreated={onTransportCreated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /USBでつなぐ/, hidden: true }));

    await waitFor(() => {
      expect(onTransportCreated).toHaveBeenCalledWith(transport, false);
    });
  });

  it("returns to a retryable failure view when connection establishment rejects", async () => {
    vi.mocked(autoConnectUsb).mockResolvedValue({
      transport,
      deviceId: "usb-test",
      deviceLabel: "USB test",
    });
    const onTransportCreated = vi.fn().mockRejectedValue(new Error("failed"));

    render(
      <ConnectModal
        open
        transports={transports}
        onTransportCreated={onTransportCreated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /USBでつなぐ/, hidden: true }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /USBでつなぐ/, hidden: true })).toBeEnabled();
    });
    expect(screen.getByText(/もう一度/)).toBeInTheDocument();
  });
});

describe("ConnectModal manual connection errors", () => {
  it("BLE接続失敗は技術メッセージを表示せず日本語のトーストを出す", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("Failed to connect to any BLE profile"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ToastProvider>
        <ConnectModal
          open
          transports={[{ label: "ワイヤレス", isWireless: true, connect }]}
          onTransportCreated={vi.fn()}
        />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /ワイヤレスでつなぐ/, hidden: true }));
    fireEvent.click(await screen.findByRole("button", { name: "ワイヤレス", hidden: true }));

    expect(await screen.findByText("キーボードが見つかりません。電源が入っているか確認してください")).toBeInTheDocument();
    expect(screen.queryByText("Failed to connect to any BLE profile")).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(expect.any(Error));
    consoleError.mockRestore();
  });

  it("分類できない手動接続失敗は再試行を案内するトーストを出す", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("RPC session disposed"));

    render(
      <ToastProvider>
        <ConnectModal
          open
          transports={[{ label: "USB", connect }]}
          onTransportCreated={vi.fn()}
        />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /USBでつなぐ/, hidden: true }));

    expect(await screen.findByText("接続できませんでした。もう一度お試しください")).toBeInTheDocument();
    expect(screen.queryByText("RPC session disposed")).toBeNull();
  });
});
