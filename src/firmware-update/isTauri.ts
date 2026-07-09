/** Runtime check: are we inside the Tauri desktop webview (vs the web build)? */
export function isTauri(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    );
  } catch {
    return false;
  }
}

/**
 * The firmware-update feature is shown only when BOTH gates pass:
 *  1. running under Tauri (the web build can't write to USB volumes), and
 *  2. the reversible release flag VITE_FEATURE_FW_UPDATE === "1".
 * Kept OFF by default in production until the flow passes on-hardware E2E.
 */
export function isFirmwareUpdateEnabled(): boolean {
  return isTauri() && import.meta.env.VITE_FEATURE_FW_UPDATE === "1";
}
