import { invoke } from "@tauri-apps/api/core";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { AvailableDevice } from ".";
import { logFrontend } from "../misc/frontendLogging";
import { createTauriTransport } from "./transportShared";
import type { ConnectionHandle } from "./transportTypes";

export async function list_devices(): Promise<Array<AvailableDevice>> {
  logFrontend("info", "[USB] Native discovery starting");
  try {
    const devices = await invoke<Array<AvailableDevice>>("serial_list_devices");
    logFrontend("info", `[USB] Native discovery returned ${devices.length} candidate(s)`);
    return devices;
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    logFrontend("warn", `[USB] Native discovery failed: type=${name}, message=${message}`, error);
    throw error;
  }
}

export async function connect(dev: AvailableDevice): Promise<RpcTransport> {
  logFrontend("info", `[USB] Native connection attempt: id=${dev.id}, label=${dev.label}`);
  let connection: ConnectionHandle;
  try {
    connection = await invoke<ConnectionHandle>("serial_connect", dev);
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    logFrontend("warn", `[USB] Native connection failed: id=${dev.id}, type=${name}, message=${message}`, error);
    throw error;
  }
  if (!connection) {
    logFrontend("warn", `[USB] Native connection returned no handle: id=${dev.id}`);
    throw new Error("Failed to connect");
  }

  logFrontend("info", `[USB] Native connection established: id=${dev.id}, generation=${connection.generation}`);
  return createTauriTransport(dev.label, connection.generation);
}
