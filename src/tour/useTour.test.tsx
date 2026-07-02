import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StrictMode } from "react";
import { render, act, screen } from "@testing-library/react";
import { driver } from "driver.js";
import type { Config } from "driver.js";
import {
  useTour,
  TOUR_PROMPT_DELAY_MS,
  TOUR_MANUAL_START_DELAY_MS,
} from "./useTour";
import { TOUR_SEEN_KEY } from "./tour-storage";
import { ToastProvider } from "../misc/Toast";
import { TelemetryProvider } from "../telemetry/TelemetryProvider";
import { enqueueEvent } from "../telemetry/telemetry-client";

const { mockDriverObj } = vi.hoisted(() => {
  return {
    mockDriverObj: {
      drive: vi.fn(),
      destroy: vi.fn(),
      isActive: vi.fn(() => true),
      hasNextStep: vi.fn(() => true),
      getActiveIndex: vi.fn((): number | undefined => 3),
    },
  };
});

vi.mock("driver.js", () => ({
  driver: vi.fn(() => mockDriverObj),
}));

vi.mock("../telemetry/telemetry-client", () => ({
  enqueueEvent: vi.fn(),
  flushQueue: vi.fn(),
  startAutoFlush: vi.fn(() => () => {}),
}));

const store = new Map<string, string>();

const mockLocalStorage = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
  removeItem: vi.fn((key: string) => { store.delete(key); }),
  clear: vi.fn(() => { store.clear(); }),
  get length() { return store.size; },
  key: vi.fn(() => null),
};

interface HarnessProps {
  connected: boolean;
  unlocked: boolean;
  activeTab?: string;
  setActiveTab?: (tab: "keymap") => void;
}

function Harness({
  connected,
  unlocked,
  activeTab = "keymap",
  setActiveTab = () => {},
}: HarnessProps) {
  const { startTour, promptOpen, acceptPrompt, declinePrompt } = useTour({
    connected,
    unlocked,
    activeTab,
    setActiveTab,
  });
  return (
    <div>
      <span data-testid="prompt-open">{String(promptOpen)}</span>
      <button data-testid="start-tour" onClick={startTour}>
        start
      </button>
      <button data-testid="accept" onClick={acceptPrompt}>
        accept
      </button>
      <button data-testid="decline" onClick={declinePrompt}>
        decline
      </button>
    </div>
  );
}

function renderHarness(props: HarnessProps, useStrictMode = false) {
  const tree = (
    <ToastProvider>
      <TelemetryProvider>
        <Harness {...props} />
      </TelemetryProvider>
    </ToastProvider>
  );
  return render(useStrictMode ? <StrictMode>{tree}</StrictMode> : tree);
}

function rerenderHarness(
  rerender: (ui: React.ReactElement) => void,
  props: HarnessProps
) {
  rerender(
    <ToastProvider>
      <TelemetryProvider>
        <Harness {...props} />
      </TelemetryProvider>
    </ToastProvider>
  );
}

function promptOpenText(): string | null {
  return screen.getByTestId("prompt-open").textContent;
}

function trackedEventNames(): string[] {
  return vi
    .mocked(enqueueEvent)
    .mock.calls.map((c) => (c[0] as { name?: string }).name ?? "");
}

function lastDriverConfig(): Config {
  const calls = vi.mocked(driver).mock.calls;
  return (calls[calls.length - 1]?.[0] ?? {}) as Config;
}

describe("useTour", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
    window.__TAURI_INTERNALS__ = {};
    mockDriverObj.drive.mockClear();
    mockDriverObj.destroy.mockClear();
    mockDriverObj.hasNextStep.mockReset();
    mockDriverObj.hasNextStep.mockReturnValue(true);
    mockDriverObj.getActiveIndex.mockReset();
    mockDriverObj.getActiveIndex.mockReturnValue(3);
    vi.mocked(driver).mockClear();
    vi.mocked(enqueueEvent).mockClear();
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    vi.useRealTimers();
  });

  describe("first-run prompt", () => {
    it("opens the prompt after the delay without starting the tour or writing the flag", () => {
      renderHarness({ connected: true, unlocked: true });

      expect(promptOpenText()).toBe("false");

      act(() => {
        vi.advanceTimersByTime(TOUR_PROMPT_DELAY_MS);
      });

      expect(promptOpenText()).toBe("true");
      expect(mockDriverObj.drive).not.toHaveBeenCalled();
      expect(store.get(TOUR_SEEN_KEY)).toBeUndefined();
    });

    it("accept: writes the flag, closes the prompt, and starts the tour", () => {
      renderHarness({ connected: true, unlocked: true });
      act(() => {
        vi.advanceTimersByTime(TOUR_PROMPT_DELAY_MS);
      });

      act(() => {
        screen.getByTestId("accept").click();
      });

      expect(promptOpenText()).toBe("false");
      expect(store.get(TOUR_SEEN_KEY)).toBe("true");
      expect(mockDriverObj.drive).toHaveBeenCalledTimes(1);
      expect(vi.mocked(enqueueEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "event",
          name: "tour_started",
          payload: { trigger: "prompt" },
        })
      );
    });

    it("decline: writes the flag, closes the prompt, and never starts the tour", () => {
      renderHarness({ connected: true, unlocked: true });
      act(() => {
        vi.advanceTimersByTime(TOUR_PROMPT_DELAY_MS);
      });

      act(() => {
        screen.getByTestId("decline").click();
      });

      expect(promptOpenText()).toBe("false");
      expect(store.get(TOUR_SEEN_KEY)).toBe("true");
      expect(mockDriverObj.drive).not.toHaveBeenCalled();
      expect(trackedEventNames()).toContain("tour_declined");
    });

    it("shows the prompt once per render pass under React.StrictMode", () => {
      renderHarness({ connected: true, unlocked: true }, true);

      act(() => {
        vi.advanceTimersByTime(TOUR_PROMPT_DELAY_MS);
      });

      expect(promptOpenText()).toBe("true");
    });

    it("does not open when the seen flag is set", () => {
      store.set(TOUR_SEEN_KEY, "true");
      renderHarness({ connected: true, unlocked: true });

      act(() => {
        vi.advanceTimersByTime(TOUR_PROMPT_DELAY_MS);
      });

      expect(promptOpenText()).toBe("false");
    });

    it("does not open outside Tauri", () => {
      delete window.__TAURI_INTERNALS__;
      renderHarness({ connected: true, unlocked: true });

      act(() => {
        vi.advanceTimersByTime(TOUR_PROMPT_DELAY_MS);
      });

      expect(promptOpenText()).toBe("false");
    });

    it("does not open while disconnected or locked", () => {
      renderHarness({ connected: false, unlocked: false });

      act(() => {
        vi.advanceTimersByTime(TOUR_PROMPT_DELAY_MS);
      });

      expect(promptOpenText()).toBe("false");
    });

    it("closes the prompt on disconnect", () => {
      const { rerender } = renderHarness({ connected: true, unlocked: true });
      act(() => {
        vi.advanceTimersByTime(TOUR_PROMPT_DELAY_MS);
      });
      expect(promptOpenText()).toBe("true");

      rerenderHarness(rerender, { connected: false, unlocked: true });

      expect(promptOpenText()).toBe("false");
    });
  });

  describe("manual start", () => {
    it("shows a toast and does not start while disconnected", () => {
      renderHarness({ connected: false, unlocked: false });

      act(() => {
        screen.getByTestId("start-tour").click();
      });
      act(() => {
        vi.advanceTimersByTime(TOUR_MANUAL_START_DELAY_MS);
      });

      expect(
        screen.getByText("キーボードを接続するとご覧いただけます")
      ).toBeInTheDocument();
      expect(mockDriverObj.drive).not.toHaveBeenCalled();
    });

    it("switches to the keymap tab before starting", () => {
      store.set(TOUR_SEEN_KEY, "true");
      const setActiveTab = vi.fn();
      renderHarness({
        connected: true,
        unlocked: true,
        activeTab: "battery",
        setActiveTab,
      });

      act(() => {
        screen.getByTestId("start-tour").click();
      });

      expect(setActiveTab).toHaveBeenCalledWith("keymap");
      expect(mockDriverObj.drive).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(TOUR_MANUAL_START_DELAY_MS);
      });

      expect(mockDriverObj.drive).toHaveBeenCalledTimes(1);
      expect(vi.mocked(enqueueEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "tour_started",
          payload: { trigger: "manual" },
        })
      );
    });

    it("works outside Tauri (browser dev parity)", () => {
      delete window.__TAURI_INTERNALS__;
      store.set(TOUR_SEEN_KEY, "true");
      renderHarness({ connected: true, unlocked: true });

      act(() => {
        screen.getByTestId("start-tour").click();
      });
      act(() => {
        vi.advanceTimersByTime(TOUR_MANUAL_START_DELAY_MS);
      });

      expect(mockDriverObj.drive).toHaveBeenCalledTimes(1);
    });
  });

  describe("teardown", () => {
    function startTourViaPrompt() {
      const rendered = renderHarness({ connected: true, unlocked: true });
      act(() => {
        vi.advanceTimersByTime(TOUR_PROMPT_DELAY_MS);
      });
      act(() => {
        screen.getByTestId("accept").click();
      });
      expect(mockDriverObj.drive).toHaveBeenCalledTimes(1);
      return rendered;
    }

    it("ignores overlay clicks instead of closing the tour", () => {
      startTourViaPrompt();

      const behavior = lastDriverConfig().overlayClickBehavior;
      expect(typeof behavior).toBe("function");

      act(() => {
        (behavior as () => void)();
      });

      expect(mockDriverObj.destroy).not.toHaveBeenCalled();
      expect(trackedEventNames()).not.toContain("tour_skipped");
    });

    it("destroys an active tour on disconnect", () => {
      const { rerender } = startTourViaPrompt();

      rerenderHarness(rerender, { connected: false, unlocked: true });

      expect(mockDriverObj.destroy).toHaveBeenCalled();
    });

    it("tracks tour_completed when closed on the last step", () => {
      startTourViaPrompt();

      mockDriverObj.hasNextStep.mockReturnValue(false);
      act(() => {
        lastDriverConfig().onDestroyStarted?.(
          undefined,
          {},
          {
            config: lastDriverConfig(),
            state: {},
            driver: mockDriverObj as never,
          }
        );
      });

      expect(trackedEventNames()).toContain("tour_completed");
      expect(mockDriverObj.destroy).toHaveBeenCalled();
    });

    it("tracks tour_skipped with the step index when closed mid-tour", () => {
      startTourViaPrompt();

      mockDriverObj.hasNextStep.mockReturnValue(true);
      mockDriverObj.getActiveIndex.mockReturnValue(3);
      act(() => {
        lastDriverConfig().onDestroyStarted?.(
          undefined,
          {},
          {
            config: lastDriverConfig(),
            state: {},
            driver: mockDriverObj as never,
          }
        );
      });

      expect(vi.mocked(enqueueEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "tour_skipped",
          payload: { step: 3 },
        })
      );
      expect(mockDriverObj.destroy).toHaveBeenCalled();
    });
  });
});
