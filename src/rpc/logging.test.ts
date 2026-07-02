import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { call_rpc as inner_call_rpc } from "@zmkfirmware/zmk-studio-ts-client";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import {
  call_rpc,
  registerForceDisconnect,
  RpcTimeoutError,
  RPC_TIMEOUT_MS,
} from "./logging";

vi.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  call_rpc: vi.fn(),
}));

const conn = {} as RpcConnection;
const req = { core: { getLockState: true } };

describe("call_rpc timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(inner_call_rpc).mockReset();
  });

  afterEach(() => {
    registerForceDisconnect(null);
    vi.useRealTimers();
  });

  it("passes a normal response through without disconnecting", async () => {
    const response = { requestId: 1 };
    vi.mocked(inner_call_rpc).mockResolvedValue(response as never);
    const forceDisconnect = vi.fn();
    registerForceDisconnect(forceDisconnect);

    await expect(call_rpc(conn, req)).resolves.toBe(response);

    vi.advanceTimersByTime(RPC_TIMEOUT_MS * 2);
    expect(forceDisconnect).not.toHaveBeenCalled();
  });

  it("passes an inner rejection through", async () => {
    vi.mocked(inner_call_rpc).mockRejectedValue(new Error("device error"));

    await expect(call_rpc(conn, req)).rejects.toThrow("device error");
  });

  it("rejects with RpcTimeoutError and forces a disconnect when the device never responds", async () => {
    vi.mocked(inner_call_rpc).mockReturnValue(new Promise(() => {}) as never);
    const forceDisconnect = vi.fn();
    registerForceDisconnect(forceDisconnect);

    const pending = call_rpc(conn, req);
    const assertion = expect(pending).rejects.toBeInstanceOf(RpcTimeoutError);

    await vi.advanceTimersByTimeAsync(RPC_TIMEOUT_MS);

    await assertion;
    expect(forceDisconnect).toHaveBeenCalledTimes(1);
  });

  it("respects a custom timeout", async () => {
    vi.mocked(inner_call_rpc).mockReturnValue(new Promise(() => {}) as never);
    const forceDisconnect = vi.fn();
    registerForceDisconnect(forceDisconnect);

    const pending = call_rpc(conn, req, 1000);
    const assertion = expect(pending).rejects.toBeInstanceOf(RpcTimeoutError);

    await vi.advanceTimersByTimeAsync(999);
    expect(forceDisconnect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(forceDisconnect).toHaveBeenCalledTimes(1);
  });
});
