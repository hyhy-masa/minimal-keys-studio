import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { AvailableDevice } from ".";

// Keep all profiles per device for fallback connection attempts
let allDevices: Array<AvailableDevice> = [];

export async function list_devices(): Promise<Array<AvailableDevice>> {
  allDevices = await invoke("gatt_list_devices");
  // Group by label to detect duplicate names (multiple profiles or multiple keyboards)
  const byLabel = new Map<string, Array<AvailableDevice>>();
  for (const d of allDevices) {
    const group = byLabel.get(d.label) || [];
    group.push(d);
    byLabel.set(d.label, group);
  }
  // If a name appears once, show as-is. If duplicates, add short ID suffix.
  const result: Array<AvailableDevice> = [];
  for (const [label, devices] of byLabel) {
    if (devices.length === 1) {
      result.push(devices[0]);
    } else {
      for (const d of devices) {
        // Extract short ID (last 4 chars of UUID) for distinction
        const shortId = d.id.replace(/[^a-f0-9]/gi, "").slice(-4);
        result.push({ ...d, label: `${label} (${shortId})` });
      }
    }
  }
  return result;
}

async function tryConnect(dev: AvailableDevice): Promise<boolean> {
  try {
    return await invoke("gatt_connect", dev);
  } catch {
    return false;
  }
}

export async function connect(dev: AvailableDevice): Promise<RpcTransport> {
  // Try the selected device first, then fall back to other profiles with the same name
  const candidates = allDevices.filter((d) => d.label === dev.label);
  let connected = false;

  for (const candidate of candidates) {
    connected = await tryConnect(candidate);
    if (connected) break;
  }

  if (!connected) {
    throw new Error("Failed to connect to any BLE profile");
  }

  const abortController = new AbortController();

  const writable = new WritableStream({
    async write(chunk) {
      await invoke("transport_send_data", new Uint8Array(chunk));
    },
  });

  const { writable: response_writable, readable } = new TransformStream();
  const response_writer = response_writable.getWriter();

  const unlisten_data = await listen(
    "connection_data",
    async (event: { payload: Array<number> }) => {
      try {
        await response_writer.write(new Uint8Array(event.payload));
      } catch (e) {
        console.error("[BLE] Failed to write response data:", e);
      }
    }
  );

  const unlisten_disconnected = await listen(
    "connection_disconnected",
    async () => {
      unlisten_data();
      unlisten_disconnected();
      try {
        await response_writer.close();
      } catch {
        // Already closed
      }
    }
  );

  const signal = abortController.signal;

  const abort_cb = async () => {
    unlisten_data();
    unlisten_disconnected();
    try {
      await response_writer.close();
    } catch {
      // Already closed
    }
    await invoke("transport_close");
    signal.removeEventListener("abort", abort_cb);
  };

  signal.addEventListener("abort", abort_cb);

  return { label: dev.label, abortController, readable, writable };
}
