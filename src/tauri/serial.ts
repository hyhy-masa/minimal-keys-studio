import { invoke } from "@tauri-apps/api/core";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { AvailableDevice } from ".";
import { createTauriTransport } from "./transportShared";
import type { ConnectionHandle } from "./transportTypes";

export async function list_devices(): Promise<Array<AvailableDevice>> {
  return await invoke("serial_list_devices");
}

export async function connect(dev: AvailableDevice): Promise<RpcTransport> {
  const connection = await invoke<ConnectionHandle>("serial_connect", dev);
  if (!connection) {
    throw new Error("Failed to connect");
  }

  return createTauriTransport(dev.label, connection.generation);
}
