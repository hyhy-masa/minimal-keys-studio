import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDevices: vi.fn(),
  connect: vi.fn(),
  createRpcConnection: vi.fn(),
  callRpc: vi.fn(),
}));

vi.mock("../tauri/serial", () => ({
  list_devices: mocks.listDevices,
  connect: mocks.connect,
}));

vi.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: mocks.createRpcConnection,
}));

vi.mock("../rpc/logging", () => ({
  call_rpc: mocks.callRpc,
}));

import {
  autoConnectUsb,
} from "./autoConnectUsb";

const firstDevice = { id: "console-port", label: "Console port" };
const secondDevice = { id: "studio-port", label: "Studio port" };
const lastSuccessfulUsbDeviceIdKey = "minimal-keys:last-successful-usb-device-id";
const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
  clear: vi.fn(() => storage.clear()),
  get length() {
    return storage.size;
  },
  key: vi.fn(() => null),
};

describe("autoConnectUsb", () => {
  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  it("skips an unresponsive first port and adopts the second responding port", async () => {
    const firstTransport = {};
    const secondTransport = {};
    mocks.listDevices.mockResolvedValue([firstDevice, secondDevice]);
    mocks.connect.mockResolvedValueOnce(firstTransport).mockResolvedValueOnce(secondTransport);
    mocks.createRpcConnection.mockReturnValueOnce({ id: 1 }).mockReturnValueOnce({ id: 2 });
    mocks.callRpc
      .mockRejectedValueOnce(new Error("no response"))
      .mockResolvedValueOnce({ core: { getDeviceInfo: { name: "minimal-keys" } } });

    await expect(autoConnectUsb()).resolves.toEqual({
      transport: secondTransport,
      deviceId: secondDevice.id,
      deviceLabel: secondDevice.label,
    });
    expect(mocks.callRpc).toHaveBeenNthCalledWith(
      1,
      { id: 1 },
      { core: { getDeviceInfo: true } },
      1500
    );
    expect(localStorage.getItem(lastSuccessfulUsbDeviceIdKey)).toBe(secondDevice.id);
  });

  it("aborts the failed candidate before trying the next port", async () => {
    const signals: AbortSignal[] = [];
    mocks.listDevices.mockResolvedValue([firstDevice, secondDevice]);
    mocks.connect.mockResolvedValue({});
    mocks.createRpcConnection.mockImplementation((_transport: unknown, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return {};
    });
    mocks.callRpc
      .mockRejectedValueOnce(new Error("no response"))
      .mockResolvedValueOnce({ core: { getDeviceInfo: { name: "minimal-keys" } } });

    await autoConnectUsb();

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it("reports no-response after every candidate fails", async () => {
    mocks.listDevices.mockResolvedValue([firstDevice, secondDevice]);
    mocks.connect.mockResolvedValue({});
    mocks.createRpcConnection.mockReturnValue({});
    mocks.callRpc.mockRejectedValue(new Error("no response"));

    await expect(autoConnectUsb()).rejects.toMatchObject({
      reason: "no-response",
    });
  });

  it("reports no-candidates without trying to connect", async () => {
    mocks.listDevices.mockResolvedValue([]);

    await expect(autoConnectUsb()).rejects.toMatchObject({
      reason: "no-candidates",
    });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("tries the previously successful port first", async () => {
    const attemptedIds: string[] = [];
    localStorage.setItem(lastSuccessfulUsbDeviceIdKey, secondDevice.id);
    mocks.listDevices.mockResolvedValue([firstDevice, secondDevice]);
    mocks.connect.mockImplementation((device: { id: string }) => {
      attemptedIds.push(device.id);
      return Promise.resolve({});
    });
    mocks.createRpcConnection.mockReturnValue({});
    mocks.callRpc.mockResolvedValue({ core: { getDeviceInfo: { name: "minimal-keys" } } });

    await autoConnectUsb();

    expect(attemptedIds).toEqual([secondDevice.id]);
  });
});
