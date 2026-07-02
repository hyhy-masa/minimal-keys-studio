import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@zmkfirmware/zmk-studio-ts-client/core", () => ({
  LockState: {
    ZMK_STUDIO_CORE_LOCK_STATE_LOCKED: 0,
    ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED: 1,
  },
}));
vi.mock("./logging", () => ({
  call_rpc: vi.fn(),
}));

import { call_rpc } from "./logging";
import { useConnectedDeviceData } from "./useConnectedDeviceData";
import { ConnectionContext } from "./ConnectionContext";
import { LockStateContext } from "./LockStateContext";

type Resp = { core?: { getLockState?: number } };

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionContext.Provider value={{ conn: {} as never }}>
      <LockStateContext.Provider value={1 as never}>
        {children}
      </LockStateContext.Provider>
    </ConnectionContext.Provider>
  );
}

function renderTestHook() {
  return renderHook(
    () =>
      useConnectedDeviceData<number>(
        { core: { getLockState: true } },
        (r) => (r as Resp).core?.getLockState
      ),
    { wrapper }
  );
}

describe("useConnectedDeviceData", () => {
  beforeEach(() => {
    vi.mocked(call_rpc).mockReset();
  });

  it("returns the mapped response on success", async () => {
    vi.mocked(call_rpc).mockResolvedValue({
      core: { getLockState: 5 },
    } as never);

    const { result } = renderTestHook();

    await waitFor(() => expect(result.current[0]).toBe(5));
    expect(result.current[2]).toBe(false); // error
  });

  it("sets error instead of hanging when the RPC fails, and retry refetches", async () => {
    vi.mocked(call_rpc).mockRejectedValueOnce(new Error("boom"));

    const { result } = renderTestHook();

    await waitFor(() => expect(result.current[2]).toBe(true)); // error
    expect(result.current[0]).toBeUndefined();

    vi.mocked(call_rpc).mockResolvedValue({
      core: { getLockState: 7 },
    } as never);

    act(() => {
      result.current[3](); // retry
    });

    await waitFor(() => expect(result.current[0]).toBe(7));
    expect(result.current[2]).toBe(false);
  });
});
