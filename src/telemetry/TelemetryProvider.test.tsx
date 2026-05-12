import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { TelemetryProvider, useTelemetry } from "./TelemetryProvider";

const store = new Map<string, string>();

const mockLocalStorage = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
  removeItem: vi.fn((key: string) => { store.delete(key); }),
  clear: vi.fn(() => { store.clear(); }),
  get length() { return store.size; },
  key: vi.fn(() => null),
};

function TestConsumer() {
  const { isOptedIn, setOptedIn, trackEvent } = useTelemetry();
  return (
    <div>
      <span data-testid="opted-in">{String(isOptedIn)}</span>
      <button data-testid="opt-in" onClick={() => setOptedIn(true)}>
        opt in
      </button>
      <button data-testid="opt-out" onClick={() => setOptedIn(false)}>
        opt out
      </button>
      <button data-testid="track" onClick={() => trackEvent("app_launched")}>
        track
      </button>
    </div>
  );
}

describe("TelemetryProvider", () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it("starts opted out when no localStorage value", () => {
    const { getByTestId } = render(
      <TelemetryProvider>
        <TestConsumer />
      </TelemetryProvider>
    );
    expect(getByTestId("opted-in").textContent).toBe("false");
  });

  it("reflects localStorage opt-in state", () => {
    store.set("telemetry-opt-in", "true");
    const { getByTestId } = render(
      <TelemetryProvider>
        <TestConsumer />
      </TelemetryProvider>
    );
    expect(getByTestId("opted-in").textContent).toBe("true");
  });

  it("toggles opt-in state", () => {
    const { getByTestId } = render(
      <TelemetryProvider>
        <TestConsumer />
      </TelemetryProvider>
    );

    expect(getByTestId("opted-in").textContent).toBe("false");

    act(() => {
      getByTestId("opt-in").click();
    });
    expect(getByTestId("opted-in").textContent).toBe("true");
    expect(store.get("telemetry-opt-in")).toBe("true");

    act(() => {
      getByTestId("opt-out").click();
    });
    expect(getByTestId("opted-in").textContent).toBe("false");
    expect(store.get("telemetry-opt-in")).toBe("false");
  });

  it("generates and persists device ID", () => {
    render(
      <TelemetryProvider>
        <TestConsumer />
      </TelemetryProvider>
    );

    const id = store.get("telemetry-device-id");
    expect(id).toBeTruthy();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("preserves existing device ID across remounts", () => {
    const { unmount } = render(
      <TelemetryProvider>
        <TestConsumer />
      </TelemetryProvider>
    );
    const firstId = store.get("telemetry-device-id");
    unmount();

    render(
      <TelemetryProvider>
        <TestConsumer />
      </TelemetryProvider>
    );
    const secondId = store.get("telemetry-device-id");

    expect(firstId).toBe(secondId);
  });

  it("trackEvent does not throw", () => {
    const { getByTestId } = render(
      <TelemetryProvider>
        <TestConsumer />
      </TelemetryProvider>
    );

    expect(() => {
      act(() => {
        getByTestId("track").click();
      });
    }).not.toThrow();
  });
});
