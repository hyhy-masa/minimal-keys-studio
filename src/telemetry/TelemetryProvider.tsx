import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  EventName,
  TelemetryError,
  TelemetryEvent,
  TelemetryKeymap,
} from "./events";
import { enqueueEvent, flushQueue, startAutoFlush } from "./telemetry-client";

interface TelemetryContextValue {
  trackEvent: (name: EventName, payload?: Record<string, unknown>) => void;
  trackError: (message: string, stack?: string, componentStack?: string) => void;
  trackKeymap: (trigger: "connect" | "save", keymapJson: string) => void;
  isOptedIn: boolean;
  setOptedIn: (v: boolean) => void;
}

const TelemetryContext = createContext<TelemetryContextValue>({
  trackEvent: () => {},
  trackError: () => {},
  trackKeymap: () => {},
  isOptedIn: false,
  setOptedIn: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export function useTelemetry(): TelemetryContextValue {
  return useContext(TelemetryContext);
}

function getDeviceId(): string {
  try {
    let id = localStorage.getItem("telemetry-device-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("telemetry-device-id", id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [optedIn, setOptedInState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("telemetry-opt-in") === "true";
    } catch {
      return false;
    }
  });

  const versionRef = useRef("unknown");

  useEffect(() => {
    (async () => {
      try {
        if (!window.__TAURI_INTERNALS__) return;
        const { getVersion } = await import("@tauri-apps/api/app");
        versionRef.current = await getVersion();
      } catch {
        // non-critical
      }
    })();
  }, []);

  useEffect(() => {
    if (!optedIn || !window.__TAURI_INTERNALS__) return;
    const stop = startAutoFlush();
    return () => {
      flushQueue();
      stop();
    };
  }, [optedIn]);

  const setOptedIn = useCallback((v: boolean) => {
    try {
      localStorage.setItem("telemetry-opt-in", v ? "true" : "false");
    } catch {
      // ignore
    }
    setOptedInState(v);
  }, []);

  const deviceId = useMemo(getDeviceId, []);

  const trackEvent = useCallback(
    (name: EventName, payload?: Record<string, unknown>) => {
      const ev: TelemetryEvent = {
        type: "event",
        name,
        deviceId,
        appVersion: versionRef.current,
        timestamp: new Date().toISOString(),
        payload,
      };
      enqueueEvent(ev);
    },
    [deviceId]
  );

  const trackError = useCallback(
    (message: string, stack?: string, componentStack?: string) => {
      const ev: TelemetryError = {
        type: "error",
        deviceId,
        appVersion: versionRef.current,
        timestamp: new Date().toISOString(),
        message,
        stack,
        componentStack,
      };
      enqueueEvent(ev);
    },
    [deviceId]
  );

  const trackKeymap = useCallback(
    (trigger: "connect" | "save", keymapJson: string) => {
      const ev: TelemetryKeymap = {
        type: "keymap",
        deviceId,
        appVersion: versionRef.current,
        timestamp: new Date().toISOString(),
        trigger,
        keymapJson,
      };
      enqueueEvent(ev);
    },
    [deviceId]
  );

  const value = useMemo(
    () => ({ trackEvent, trackError, trackKeymap, isOptedIn: optedIn, setOptedIn }),
    [trackEvent, trackError, trackKeymap, optedIn, setOptedIn]
  );

  return (
    <TelemetryContext.Provider value={value}>
      {children}
    </TelemetryContext.Provider>
  );
}
