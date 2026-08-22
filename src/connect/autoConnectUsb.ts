import { create_rpc_connection } from "@zmkfirmware/zmk-studio-ts-client";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

import { call_rpc } from "../rpc/logging";
import { logFrontend } from "../misc/frontendLogging";
import { connect, list_devices } from "../tauri/serial";

// A short probe keeps non-RPC USB ports from delaying connection unnecessarily.
const USB_PROBE_TIMEOUT_MS = 1500;
const USB_RETRY_PROBE_TIMEOUT_MS = 3000;
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

async function probeDevice(
  device: Awaited<ReturnType<typeof list_devices>>[number],
  pass: number,
  timeoutMs: number
): Promise<boolean> {
  const abortController = new AbortController();
  const startedAt = Date.now();
  logFrontend(
    "info",
    `[USB] Probe starting: id=${device.id}, label=${device.label}, pass=${pass}, timeoutMs=${timeoutMs}`
  );

  try {
    const probeTransport = await connect(device);
    const connection = create_rpc_connection(probeTransport, { signal: abortController.signal });
    const response = await call_rpc(connection, { core: { getDeviceInfo: true } }, timeoutMs);

    if (!response.core?.getDeviceInfo) {
      throw new Error("Device did not return device information");
    }

    logFrontend(
      "info",
      `[USB] Probe succeeded: id=${device.id}, pass=${pass}, timeoutMs=${timeoutMs}, elapsedMs=${Date.now() - startedAt}`
    );
    return true;
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    logFrontend(
      "warn",
      `[USB] Candidate failed: id=${device.id}, pass=${pass}, timeoutMs=${timeoutMs}, elapsedMs=${Date.now() - startedAt}, type=${name}, message=${message}`,
      error
    );
    return false;
  } finally {
    abortController.abort();
  }
}

export async function autoConnectUsb(): Promise<AutoConnectResult> {
  const devices = await list_devices();
  logFrontend("info", `[USB] Discovery completed: ${devices.length} candidate(s)`);
  if (devices.length === 0) {
    logFrontend("warn", "[USB] No connection candidates found");
    throw new AutoConnectError("no-candidates");
  }

  const lastSuccessfulDeviceId = localStorage.getItem(LAST_SUCCESSFUL_USB_DEVICE_ID_KEY);
  const candidates = lastSuccessfulDeviceId
    ? [
        ...devices.filter((device) => device.id === lastSuccessfulDeviceId),
        ...devices.filter((device) => device.id !== lastSuccessfulDeviceId),
      ]
    : devices;

  let firstPassHadResponse = false;
  for (const [passIndex, timeoutMs] of [USB_PROBE_TIMEOUT_MS, USB_RETRY_PROBE_TIMEOUT_MS].entries()) {
    const pass = passIndex + 1;
    if (pass === 2) {
      if (firstPassHadResponse) {
        break;
      }
      // All first-pass probe streams have been aborted; let Tauri release ports before retrying them.
      await new Promise((resolve) => setTimeout(resolve, USB_REOPEN_DELAY_MS));
    }

    for (const device of candidates) {
      const responded = await probeDevice(device, pass, timeoutMs);
      if (!responded) {
        continue;
      }
      if (pass === 1) {
        firstPassHadResponse = true;
      }

      // Aborting closes the RPC streams asynchronously; give Tauri time to release the
      // serial port before opening the same device for the real connection.
      await new Promise((resolve) => setTimeout(resolve, USB_REOPEN_DELAY_MS));
      logFrontend("info", `[USB] Opening production connection: id=${device.id}`);
      try {
        const transport = await connect(device);
        localStorage.setItem(LAST_SUCCESSFUL_USB_DEVICE_ID_KEY, device.id);
        logFrontend("info", `[USB] Connection established: id=${device.id}, label=${device.label}`);
        return {
          transport,
          deviceId: device.id,
          deviceLabel: device.label,
        };
      } catch (error) {
        const name = error instanceof Error ? error.name : typeof error;
        const message = error instanceof Error ? error.message : String(error);
        logFrontend(
          "warn",
          `[USB] Opening production connection failed: id=${device.id}, pass=${pass}, type=${name}, message=${message}`,
          error
        );
      }
    }
  }

  logFrontend("warn", "[USB] All candidates failed to respond");
  throw new AutoConnectError("no-response");
}
