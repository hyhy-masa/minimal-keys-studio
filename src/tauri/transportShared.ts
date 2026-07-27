import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

import {
  CONNECTION_DATA_EVENT,
  CONNECTION_DISCONNECTED_EVENT,
  type ConnectionDataPayload,
  type ConnectionDisconnectedPayload,
} from "./transportTypes";

export async function createTauriTransport(
  label: string,
  generation: number
): Promise<RpcTransport> {
  const abortController = new AbortController();
  const { writable: responseWritable, readable } = new TransformStream<
    Uint8Array,
    Uint8Array
  >();

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      await invoke("transport_send_data", new Uint8Array(chunk));
    },
  });

  let cleanupPromise: Promise<void> | undefined;

  const abortCallback = () => {
    void cleanup();
  };

  const unlistenData: UnlistenFn = await listen<ConnectionDataPayload>(
    CONNECTION_DATA_EVENT,
    async (event) => {
      if (event.payload.generation !== generation) return;

      const writer = responseWritable.getWriter();
      try {
        await writer.write(new Uint8Array(event.payload.data));
      } catch {
        // Cleanup may have closed the stream while this event was in flight.
      } finally {
        writer.releaseLock();
      }
    }
  );

  const unlistenDisconnected: UnlistenFn =
    await listen<ConnectionDisconnectedPayload>(
    CONNECTION_DISCONNECTED_EVENT,
    async (event) => {
      if (event.payload.generation !== generation) return;
      await cleanup();
    }
    );

  const cleanup = (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;

    cleanupPromise = (async () => {
      unlistenData();
      unlistenDisconnected();

      void responseWritable.close().catch(() => {
        // The stream may already be closed by a simultaneous cleanup.
      });

      await invoke("transport_close", { generation });
      abortController.signal.removeEventListener("abort", abortCallback);
    })();

    return cleanupPromise;
  };

  abortController.signal.addEventListener("abort", abortCallback);

  return { label, abortController, readable, writable };
}
