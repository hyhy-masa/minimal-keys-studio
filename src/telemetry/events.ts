export type EventName =
  | "app_launched"
  | "device_connected"
  | "device_disconnected"
  | "keymap_saved"
  | "keymap_discarded"
  | "tab_switched";

export type TelemetryPayload =
  | TelemetryEvent
  | TelemetryError
  | TelemetryKeymap;

export interface TelemetryEvent {
  type: "event";
  name: EventName;
  deviceId: string;
  appVersion: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface TelemetryError {
  type: "error";
  deviceId: string;
  appVersion: string;
  timestamp: string;
  message: string;
  stack?: string;
  componentStack?: string;
}

export interface TelemetryKeymap {
  type: "keymap";
  deviceId: string;
  appVersion: string;
  timestamp: string;
  trigger: "connect" | "save";
  keymapJson: string;
}
