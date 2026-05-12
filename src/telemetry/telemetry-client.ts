import type { TelemetryPayload } from "./events";

const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbwfHvOyiSE8_WNVaA26Vg0AhcHlP--1wfS-iC9yscnuhrKVMMURWOGagrLCew7iGKCIag/exec";

const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_BATCH_SIZE = 10;
const RETRY_DELAY_MS = 5_000;

let queue: TelemetryPayload[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function isTauri(): boolean {
  try {
    return !!window.__TAURI_INTERNALS__;
  } catch {
    return false;
  }
}

export function isOptedIn(): boolean {
  try {
    return localStorage.getItem("telemetry-opt-in") === "true";
  } catch {
    return false;
  }
}

export function enqueueEvent(payload: TelemetryPayload): void {
  try {
    if (!isTauri() || !isOptedIn()) return;
    queue.push(payload);
    if (queue.length >= FLUSH_BATCH_SIZE) {
      flushQueue();
    }
  } catch {
    // telemetry must never break the app
  }
}

export async function flushQueue(): Promise<void> {
  try {
    if (!isTauri() || !isOptedIn() || queue.length === 0) return;

    const batch = queue.splice(0);
    const ok = await sendBatch(batch);
    if (!ok) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      await sendBatch(batch);
    }
  } catch {
    // silently discard on failure
  }
}

async function sendBatch(batch: TelemetryPayload[]): Promise<boolean> {
  try {
    const { fetch } = await import("@tauri-apps/plugin-http");
    const resp = await fetch(GAS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    return resp.ok || resp.status === 302;
  } catch {
    return false;
  }
}

export function startAutoFlush(): () => void {
  try {
    if (flushTimer) return stopAutoFlush;
    flushTimer = setInterval(() => {
      flushQueue();
    }, FLUSH_INTERVAL_MS);
    return stopAutoFlush;
  } catch {
    return () => {};
  }
}

function stopAutoFlush(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function _resetForTesting(): void {
  queue = [];
  stopAutoFlush();
}
