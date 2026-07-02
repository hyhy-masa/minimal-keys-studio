import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TOUR_SEEN_KEY,
  shouldAutoStartTour,
  hasSeenTour,
  markTourSeen,
} from "./tour-storage";

const store = new Map<string, string>();

const mockLocalStorage = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
  removeItem: vi.fn((key: string) => { store.delete(key); }),
  clear: vi.fn(() => { store.clear(); }),
  get length() { return store.size; },
  key: vi.fn(() => null),
};

describe("shouldAutoStartTour", () => {
  it("returns true only when Tauri, connected, unlocked, and flag unset", () => {
    expect(
      shouldAutoStartTour({
        isTauri: true,
        connected: true,
        unlocked: true,
        flagValue: null,
      })
    ).toBe(true);
  });

  it("returns false when not running in Tauri", () => {
    expect(
      shouldAutoStartTour({
        isTauri: false,
        connected: true,
        unlocked: true,
        flagValue: null,
      })
    ).toBe(false);
  });

  it("returns false when not connected", () => {
    expect(
      shouldAutoStartTour({
        isTauri: true,
        connected: false,
        unlocked: true,
        flagValue: null,
      })
    ).toBe(false);
  });

  it("returns false when locked", () => {
    expect(
      shouldAutoStartTour({
        isTauri: true,
        connected: true,
        unlocked: false,
        flagValue: null,
      })
    ).toBe(false);
  });

  it("returns false when the seen flag is already set", () => {
    expect(
      shouldAutoStartTour({
        isTauri: true,
        connected: true,
        unlocked: true,
        flagValue: "true",
      })
    ).toBe(false);
  });
});

describe("hasSeenTour / markTourSeen", () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it("hasSeenTour is false initially", () => {
    expect(hasSeenTour()).toBe(false);
  });

  it("markTourSeen persists the flag", () => {
    markTourSeen();
    expect(store.get(TOUR_SEEN_KEY)).toBe("true");
    expect(hasSeenTour()).toBe(true);
  });

  it("does not throw when localStorage is unavailable", () => {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new Error("denied");
      },
      configurable: true,
    });
    expect(() => markTourSeen()).not.toThrow();
    expect(hasSeenTour()).toBe(false);
  });
});
