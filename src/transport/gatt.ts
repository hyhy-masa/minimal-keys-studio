import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";

const ZMK_STUDIO_SERVICE_UUID = "00000000-0196-6107-c967-c5cfb1c2482a";
const ZMK_STUDIO_RPC_CHRC_UUID = "00000001-0196-6107-c967-c5cfb1c2482a";

const POST_NOTIFY_DELAY_MS = 300;
const WRITE_MAX_RETRIES = 3;
const WRITE_RETRY_BASE_MS = 500;
const RECONNECT_MAX_RETRIES = 3;
const RECONNECT_INITIAL_DELAY_MS = 2000;

/**
 * Serializes GATT write operations to prevent concurrent access.
 * macOS Chrome disconnects when parallel GATT operations are issued.
 */
class GattWriteQueue {
  private queue: Promise<void> = Promise.resolve();

  enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
}

/**
 * Writes data with retry logic and exponential backoff.
 */
async function writeWithRetry(
  char: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array,
): Promise<void> {
  for (let attempt = 0; attempt < WRITE_MAX_RETRIES; attempt++) {
    try {
      await char.writeValueWithResponse(data);
      return;
    } catch (e) {
      console.warn(
        `[BLE] Write failed (attempt ${attempt + 1}/${WRITE_MAX_RETRIES}):`,
        e,
      );
      if (attempt === WRITE_MAX_RETRIES - 1) throw e;
      await new Promise((r) =>
        setTimeout(r, WRITE_RETRY_BASE_MS * (attempt + 1)),
      );
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface GattConnection {
  device: BluetoothDevice;
  service: BluetoothRemoteGATTService;
  characteristic: BluetoothRemoteGATTCharacteristic;
}

/**
 * Discovers the ZMK Studio GATT service and RPC characteristic on a device.
 */
async function discoverService(
  device: BluetoothDevice,
): Promise<GattConnection> {
  if (!device.gatt) {
    throw new Error("No GATT on selected device");
  }

  if (!device.gatt.connected) {
    console.debug("[BLE] Connecting to GATT server...");
    await device.gatt.connect();
    console.debug("[BLE] GATT connected");
  }

  console.debug("[BLE] Discovering service:", ZMK_STUDIO_SERVICE_UUID);
  let service: BluetoothRemoteGATTService;
  try {
    service = await device.gatt.getPrimaryService(ZMK_STUDIO_SERVICE_UUID);
  } catch (e) {
    device.gatt.disconnect();
    throw new Error(
      `Device "${device.name}" does not have ZMK Studio GATT service. ` +
        `Ensure CONFIG_ZMK_STUDIO=y and CONFIG_ZMK_STUDIO_TRANSPORT_BLE=y in firmware.`,
    );
  }

  const characteristic = await service.getCharacteristic(
    ZMK_STUDIO_RPC_CHRC_UUID,
  );
  console.debug("[BLE] Service and characteristic found");

  return { device, service, characteristic };
}

/**
 * Sets up readable and writable streams on a GATT characteristic.
 */
function setupStreams(
  conn: GattConnection,
  writeQueue: GattWriteQueue,
): { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> } {
  const { device, characteristic } = conn;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      // macOS Chrome: stopNotifications() is not implemented, skip it
      await characteristic.startNotifications();
      // Wait for encryption handshake and CCCD write to complete
      await delay(POST_NOTIFY_DELAY_MS);
      console.debug("[BLE] Notifications started (after %dms delay)", POST_NOTIFY_DELAY_MS);

      const onValue = (ev: Event) => {
        const buf = (ev.target as BluetoothRemoteGATTCharacteristic)?.value
          ?.buffer;
        if (buf) {
          controller.enqueue(new Uint8Array(buf));
        }
      };

      const onDisconnect = () => {
        characteristic.removeEventListener("characteristicvaluechanged", onValue);
        device.removeEventListener("gattserverdisconnected", onDisconnect);
        controller.close();
      };

      characteristic.addEventListener("characteristicvaluechanged", onValue);
      device.addEventListener("gattserverdisconnected", onDisconnect);
    },
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      return writeQueue.enqueue(() => writeWithRetry(characteristic, chunk));
    },
  });

  return { readable, writable };
}

/**
 * BLE GATT transport for ZMK Studio.
 *
 * Features:
 * - writeValueWithResponse (firmware requires WRITE, not WRITE_WITHOUT_RESP)
 * - acceptAllDevices mode (firmware doesn't advertise service UUID in adverts)
 * - Post-startNotifications delay for encryption/CCCD stabilization
 * - Serialized GATT write queue (prevents macOS Chrome disconnections)
 * - Write retry with exponential backoff
 * - Automatic reconnection on disconnection (exponential backoff, max 3 retries)
 */
export async function connect(): Promise<RpcTransport> {
  console.debug("[BLE] Starting device scan...");

  const device = await navigator.bluetooth
    .requestDevice({
      acceptAllDevices: true,
      optionalServices: [ZMK_STUDIO_SERVICE_UUID],
    })
    .catch((e) => {
      if (e instanceof DOMException && e.name === "NotFoundError") {
        throw new UserCancelledError(
          "User cancelled the connection attempt",
          { cause: e },
        );
      }
      throw e;
    });

  console.debug("[BLE] Device selected:", device.name, "id:", device.id);

  const abortController = new AbortController();
  const label = device.name || "Unknown";
  const writeQueue = new GattWriteQueue();

  // Initial connection
  let conn = await discoverService(device);
  let { readable, writable } = setupStreams(conn, writeQueue);

  // Auto-reconnection on disconnect
  device.addEventListener("gattserverdisconnected", async () => {
    console.warn("[BLE] GATT disconnected, attempting reconnection...");

    for (let attempt = 0; attempt < RECONNECT_MAX_RETRIES; attempt++) {
      const waitMs = RECONNECT_INITIAL_DELAY_MS * Math.pow(2, attempt);
      console.debug(
        `[BLE] Reconnect attempt ${attempt + 1}/${RECONNECT_MAX_RETRIES} in ${waitMs}ms`,
      );
      await delay(waitMs);

      if (abortController.signal.aborted) {
        console.debug("[BLE] Reconnection aborted by user");
        return;
      }

      try {
        conn = await discoverService(device);
        const streams = setupStreams(conn, writeQueue);
        readable = streams.readable;
        writable = streams.writable;
        console.debug("[BLE] Reconnected successfully");
        return;
      } catch (e) {
        console.warn(`[BLE] Reconnect attempt ${attempt + 1} failed:`, e);
      }
    }

    console.error("[BLE] All reconnection attempts failed");
  });

  const sig = abortController.signal;
  const abortCb = () => {
    sig.removeEventListener("abort", abortCb);
    device.gatt?.disconnect();
  };
  sig.addEventListener("abort", abortCb);

  console.debug("[BLE] Connection fully established!");
  return { label, abortController, readable, writable };
}
