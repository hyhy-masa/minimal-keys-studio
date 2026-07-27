/**
 * Contract between the Tauri transport layer (Rust) and the front end.
 *
 * Every connection opened by `gatt_connect` / `serial_connect` is stamped with a
 * monotonically increasing generation. Both sides carry it so that a connection
 * being torn down can never clobber the connection that replaced it.
 *
 * Without this, a USB attempt that fails and cleans up asynchronously wipes the
 * BLE connection the user opened in the meantime, and every later send fails
 * with "No active connection" until the app is restarted.
 */

/** Event carrying inbound bytes from a connection. */
export const CONNECTION_DATA_EVENT = "connection_data";

/** Event signalling that a connection was closed. */
export const CONNECTION_DISCONNECTED_EVENT = "connection_disconnected";

/** Payload of {@link CONNECTION_DATA_EVENT}. */
export interface ConnectionDataPayload {
  /** Generation of the connection these bytes came from. */
  generation: number;
  data: number[];
}

/** Payload of {@link CONNECTION_DISCONNECTED_EVENT}. */
export interface ConnectionDisconnectedPayload {
  /** Generation of the connection that closed. */
  generation: number;
}

/**
 * Success value of the `gatt_connect` / `serial_connect` commands.
 *
 * These commands previously returned a bare `true`; they now return the
 * generation so the caller can filter events and close only its own connection.
 */
export interface ConnectionHandle {
  generation: number;
}

/**
 * Arguments of the `transport_close` command.
 *
 * Closing is generation-scoped: the backend clears the active connection only
 * when the generation still matches, so a late teardown is a no-op.
 */
export interface TransportCloseArgs {
  generation: number;
}
