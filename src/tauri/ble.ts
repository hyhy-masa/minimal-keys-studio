import { invoke } from "@tauri-apps/api/core";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { AvailableDevice } from ".";
import { logFrontend } from "../misc/frontendLogging";
import { createTauriTransport } from "./transportShared";
import type { ConnectionHandle } from "./transportTypes";

// Keep all profiles per device for fallback connection attempts
let allDevices: Array<AvailableDevice> = [];

export async function list_devices(): Promise<Array<AvailableDevice>> {
  logFrontend("info", "[BLE] Native discovery starting");
  try {
    allDevices = await invoke("gatt_list_devices");
    logFrontend("info", `[BLE] Native discovery returned ${allDevices.length} candidate(s)`);
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    logFrontend("warn", `[BLE] Native discovery failed: type=${name}, message=${message}`, error);
    throw error;
  }
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
  logFrontend("info", `[BLE] Native connection attempt: id=${dev.id}, label=${dev.label}`);
  try {
    const connection = await invoke<ConnectionHandle>("gatt_connect", dev);
    logFrontend("info", `[BLE] Native connection established: id=${dev.id}, generation=${connection.generation}`);
    return connection;
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    logFrontend("warn", `[BLE] Native connection failed: id=${dev.id}, type=${name}, message=${message}`, error);
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
  logFrontend("info", `[BLE] Connecting with ${candidates.length} candidate(s): requested=${dev.id}`);
  let connection: ConnectionHandle | undefined;

  for (const candidate of candidates) {
    connection = await tryConnect(candidate);
    if (connection) break;
  }

  if (!connection) {
    logFrontend("warn", `[BLE] All candidates failed: requested=${dev.id}`);
    throw new Error("Failed to connect to any BLE profile");
  }

  logFrontend("info", `[BLE] Connection selected: requested=${dev.id}, generation=${connection.generation}`);
  return createTauriTransport(dev.label, connection.generation);
}
