// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { enqueueEvent, flushQueue, startAutoFlush, isOptedIn, _resetForTesting } from "./telemetry-client";
import type { TelemetryEvent } from "./events";

function makeEvent(name = "app_launched"): TelemetryEvent {
  return {
    type: "event",
    name: name as TelemetryEvent["name"],
    deviceId: "test-uuid",
    appVersion: "1.0.0",
    timestamp: new Date().toISOString(),
  };
}

const store = new Map<string, string>();

const mockLocalStorage = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
  removeItem: vi.fn((key: string) => { store.delete(key); }),
  clear: vi.fn(() => { store.clear(); }),
  get length() { return store.size; },
  key: vi.fn(() => null),
};

describe("telemetry-client", () => {
  beforeEach(() => {
    _resetForTesting();
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    _resetForTesting();
    store.clear();
  });

  describe("isOptedIn", () => {
    it("returns false when no value is set", () => {
      expect(isOptedIn()).toBe(false);
    });

    it("returns true when opted in", () => {
      store.set("telemetry-opt-in", "true");
      expect(isOptedIn()).toBe(true);
    });

    it("returns false when opted out", () => {
      store.set("telemetry-opt-in", "false");
      expect(isOptedIn()).toBe(false);
    });
  });

  describe("enqueueEvent", () => {
    it("does nothing when not in Tauri environment", () => {
      store.set("telemetry-opt-in", "true");
      enqueueEvent(makeEvent());
    });

    it("does nothing when not opted in", () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      enqueueEvent(makeEvent());
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = undefined;
    });
  });

  describe("flushQueue", () => {
    it("does nothing with empty queue", async () => {
      await flushQueue();
    });
  });

  describe("startAutoFlush", () => {
    it("returns a cleanup function", () => {
      const stop = startAutoFlush();
      expect(typeof stop).toBe("function");
      stop();
    });

    it("does not create multiple intervals", () => {
      const stop1 = startAutoFlush();
      const stop2 = startAutoFlush();
      expect(stop1).toBe(stop2);
      stop1();
    });
  });

  describe("batch trigger", () => {
    it("enqueuing events in Tauri with opt-in does not throw", () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      store.set("telemetry-opt-in", "true");

      for (let i = 0; i < 15; i++) {
        enqueueEvent(makeEvent());
      }

      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = undefined;
    });
  });
});
