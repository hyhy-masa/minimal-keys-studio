import { create_rpc_connection } from "@zmkfirmware/zmk-studio-ts-client";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

import { call_rpc } from "../rpc/logging";
import { connect, list_devices } from "../tauri/serial";

// A short probe keeps non-RPC USB ports from delaying connection unnecessarily.
const USB_PROBE_TIMEOUT_MS = 1500;
const USB_REOPEN_DELAY_MS = 100;
// Remember the working port so reconnects can normally succeed on the first probe.
const LAST_SUCCESSFUL_USB_DEVICE_ID_KEY = "minimal-keys:last-successful-usb-device-id";

export type AutoConnectFailureReason = "no-candidates" | "no-response";

export class AutoConnectError extends Error {
  readonly reason: AutoConnectFailureReason;

  constructor(reason: AutoConnectFailureReason) {
    super(reason);
    this.name = "AutoConnectError";
    this.reason = reason;
    Object.setPrototypeOf(this, AutoConnectError.prototype);
  }
}

export interface AutoConnectResult {
  transport: RpcTransport;
  deviceId: string;
  deviceLabel: string;
}

export async function autoConnectUsb(): Promise<AutoConnectResult> {
  const devices = await list_devices();
  if (devices.length === 0) {
    throw new AutoConnectError("no-candidates");
  }

  const lastSuccessfulDeviceId = localStorage.getItem(LAST_SUCCESSFUL_USB_DEVICE_ID_KEY);
  const candidates = lastSuccessfulDeviceId
    ? [
        ...devices.filter((device) => device.id === lastSuccessfulDeviceId),
        ...devices.filter((device) => device.id !== lastSuccessfulDeviceId),
      ]
    : devices;

  for (const device of candidates) {
    const abortController = new AbortController();

    try {
      const probeTransport = await connect(device);
      const connection = create_rpc_connection(probeTransport, { signal: abortController.signal });
      const response = await call_rpc(
        connection,
        { core: { getDeviceInfo: true } },
        USB_PROBE_TIMEOUT_MS
      );

      if (!response.core?.getDeviceInfo) {
        throw new Error("Device did not return device information");
      }

      abortController.abort();
      // Aborting closes the RPC streams asynchronously; give Tauri time to release the
      // serial port before opening the same device for the real connection.
      await new Promise((resolve) => setTimeout(resolve, USB_REOPEN_DELAY_MS));
      const transport = await connect(device);

      localStorage.setItem(LAST_SUCCESSFUL_USB_DEVICE_ID_KEY, device.id);
      return {
        transport,
        deviceId: device.id,
        deviceLabel: device.label,
      };
    } catch {
      abortController.abort();
    }
  }

  throw new AutoConnectError("no-response");
}
