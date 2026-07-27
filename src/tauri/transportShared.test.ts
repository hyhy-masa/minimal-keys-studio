import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  CONNECTION_DATA_EVENT,
  CONNECTION_DISCONNECTED_EVENT,
} from "./transportTypes";
import { createTauriTransport } from "./transportShared";

type EventHandler = (event: { payload: unknown }) => Promise<void> | void;

describe("createTauriTransport", () => {
  const handlers = new Map<string, EventHandler>();
  const unlistenData = vi.fn();
  const unlistenDisconnected = vi.fn();

  beforeEach(() => {
    handlers.clear();
    unlistenData.mockReset();
    unlistenDisconnected.mockReset();
    vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
    vi.mocked(listen).mockReset().mockImplementation(async (event, handler) => {
      handlers.set(event, handler as EventHandler);
      return event === CONNECTION_DATA_EVENT ? unlistenData : unlistenDisconnected;
    });
  });

  it("drops data from an older generation", async () => {
    const transport = await createTauriTransport("new connection", 2);
    const reader = transport.readable.getReader();

    await handlers.get(CONNECTION_DATA_EVENT)!({
      payload: { generation: 1, data: [1, 2, 3] },
    });

    const nextRead = reader.read();
    const ownWrite = handlers.get(CONNECTION_DATA_EVENT)!({
      payload: { generation: 2, data: [4, 5, 6] },
    });

    await expect(nextRead).resolves.toEqual({
      value: new Uint8Array([4, 5, 6]),
      done: false,
    });
    await ownWrite;
  });

  it("delivers data from its own generation", async () => {
    const transport = await createTauriTransport("current connection", 7);
    const reader = transport.readable.getReader();
    const nextRead = reader.read();

    const ownWrite = handlers.get(CONNECTION_DATA_EVENT)!({
      payload: { generation: 7, data: [9] },
    });

    await expect(nextRead).resolves.toEqual({
      value: new Uint8Array([9]),
      done: false,
    });
    await ownWrite;
  });

  it("removes listeners and closes its own generation on abort", async () => {
    const transport = await createTauriTransport("serial device", 11);

    transport.abortController.abort();

    await vi.waitFor(() => {
      expect(unlistenData).toHaveBeenCalledOnce();
      expect(unlistenDisconnected).toHaveBeenCalledOnce();
    });
    expect(invoke).toHaveBeenCalledWith("transport_close", { generation: 11 });
  });

  it("cleans up safely when disconnect and abort both happen", async () => {
    const transport = await createTauriTransport("BLE device", 13);

    await handlers.get(CONNECTION_DISCONNECTED_EVENT)!({
      payload: { generation: 13 },
    });
    transport.abortController.abort();

    await vi.waitFor(() => {
      expect(unlistenData).toHaveBeenCalledOnce();
      expect(unlistenDisconnected).toHaveBeenCalledOnce();
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("transport_close", { generation: 13 });
  });
});
