import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConnectionContext } from "./ConnectionContext";
import { call_rpc } from "./logging";
import type { CustomSubsystemInfo } from "@zmkfirmware/zmk-studio-ts-client/custom";
import { useSub } from "../usePubSub";
import { LockStateContext } from "./LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";

export interface CustomSubsystemConnection {
  subsystemIndex: number;
  callRPC: (payload: Uint8Array) => Promise<Uint8Array>;
}

// Cached subsystem list context
export const CustomSubsystemsContext = createContext<CustomSubsystemInfo[]>([]);

export function CustomSubsystemsProvider({ children }: { children: React.ReactNode }) {
  const conn = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const [subsystems, setSubsystems] = useState<CustomSubsystemInfo[]>([]);

  useEffect(() => {
    if (
      !conn.conn ||
      lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setSubsystems([]);
      return;
    }

    let ignore = false;

    async function discover() {
      if (!conn.conn) return;
      try {
        const resp = await call_rpc(conn.conn, {
          custom: { listCustomSubsystems: {} },
        });
        if (ignore) return;

        const list = resp.custom?.listCustomSubsystems?.subsystems ?? [];
        console.debug("[CustomSubsystems] Discovered:", list.map((s: CustomSubsystemInfo) => s.identifier));
        setSubsystems(list);
      } catch (e) {
        console.error("[CustomSubsystems] Discovery failed:", e);
        if (!ignore) setSubsystems([]);
      }
    }

    discover();
    return () => { ignore = true; };
  }, [conn.conn, lockState]);

  return (
    <CustomSubsystemsContext.Provider value={subsystems}>
      {children}
    </CustomSubsystemsContext.Provider>
  );
}

/**
 * Discover and connect to a custom subsystem by identifier.
 * Uses cached subsystem list from CustomSubsystemsProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCustomSubsystem(
  identifier: string
): CustomSubsystemConnection | null {
  const conn = useContext(ConnectionContext);
  const allSubsystems = useContext(CustomSubsystemsContext);

  const subsystem = useMemo(
    () => allSubsystems.find((s) => s.identifier === identifier) ?? null,
    [allSubsystems, identifier]
  );

  const callRPC = useCallback(
    async (payload: Uint8Array): Promise<Uint8Array> => {
      if (!conn.conn || !subsystem) {
        throw new Error(`Custom subsystem ${identifier} not connected`);
      }
      const resp = await call_rpc(conn.conn, {
        custom: {
          call: {
            subsystemIndex: subsystem.index,
            payload,
          },
        },
      });
      return resp.custom?.call?.payload ?? new Uint8Array(0);
    },
    [conn.conn, subsystem, identifier]
  );

  return useMemo<CustomSubsystemConnection | null>(() => {
    if (!subsystem) return null;
    return {
      subsystemIndex: subsystem.index,
      callRPC,
    };
  }, [subsystem, callRPC]);
}

/**
 * Subscribe to custom subsystem notifications.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCustomNotification(
  subsystemIndex: number | undefined,
  onNotification: (payload: Uint8Array) => void
) {
  const callbackRef = useRef(onNotification);
  callbackRef.current = onNotification;

  useSub("rpc_notification.custom.customNotification", (notification: { subsystemIndex?: number; payload: Uint8Array }) => {
    if (
      subsystemIndex !== undefined &&
      notification?.subsystemIndex === subsystemIndex
    ) {
      callbackRef.current(notification.payload);
    }
  });
}
