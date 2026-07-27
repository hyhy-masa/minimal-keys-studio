import { invoke } from "@tauri-apps/api/core";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { AvailableDevice } from ".";
import { createTauriTransport } from "./transportShared";
import type { ConnectionHandle } from "./transportTypes";

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

async function tryConnect(
  dev: AvailableDevice
): Promise<ConnectionHandle | undefined> {
  try {
    return await invoke<ConnectionHandle>("gatt_connect", dev);
  } catch {
    return undefined;
  }
}

export async function connect(dev: AvailableDevice): Promise<RpcTransport> {
  // Try the selected device first (by id), then fall back to other profiles
  // with the same original name
  const originalLabel = dev.label.replace(/\s*\([a-f0-9]+\)$/, "");
  const candidates = [
    // Put the exact device first
    ...allDevices.filter((d) => d.id === dev.id),
    // Then other profiles with the same base name
    ...allDevices.filter((d) => d.id !== dev.id && d.label === originalLabel),
  ];
  let connection: ConnectionHandle | undefined;

  for (const candidate of candidates) {
    connection = await tryConnect(candidate);
    if (connection) break;
  }

  if (!connection) {
    throw new Error("Failed to connect to any BLE profile");
  }

  return createTauriTransport(dev.label, connection.generation);
}
