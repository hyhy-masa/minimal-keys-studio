import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ConnectionContext } from "./ConnectionContext";
import { call_rpc } from "./logging";
import type { CustomSubsystemInfo } from "@zmkfirmware/zmk-studio-ts-client/custom";
import { useSub } from "../usePubSub";

export interface CustomSubsystemConnection {
  subsystemIndex: number;
  callRPC: (payload: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Discover and connect to a custom subsystem by identifier.
 * Returns null if not found or not connected.
 */
export function useCustomSubsystem(
  identifier: string
): CustomSubsystemConnection | null {
  const conn = useContext(ConnectionContext);
  const [subsystem, setSubsystem] = useState<CustomSubsystemInfo | null>(null);

  useEffect(() => {
    if (!conn.conn) {
      setSubsystem(null);
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

        const allSubsystems = resp.custom?.listCustomSubsystems?.subsystems ?? [];
        console.log(`[CustomSubsystem] Available subsystems:`, allSubsystems.map(s => s.identifier));
        const found = allSubsystems.find(
          (s) => s.identifier === identifier
        );
        if (found) {
          console.log(`[CustomSubsystem] Found '${identifier}' at index ${found.index}`);
        } else {
          console.warn(`[CustomSubsystem] '${identifier}' not found in available subsystems`);
        }
        setSubsystem(found ?? null);
      } catch (e) {
        console.error(`[CustomSubsystem] Failed to discover '${identifier}':`, e);
        if (!ignore) setSubsystem(null);
      }
    }

    discover();
    return () => {
      ignore = true;
    };
  }, [conn.conn, identifier]);

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

  if (!subsystem) return null;

  return {
    subsystemIndex: subsystem.index,
    callRPC,
  };
}

/**
 * Subscribe to custom subsystem notifications.
 * The callback receives the raw payload bytes for the given subsystem index.
 */
export function useCustomNotification(
  subsystemIndex: number | undefined,
  onNotification: (payload: Uint8Array) => void
) {
  const callbackRef = useRef(onNotification);
  callbackRef.current = onNotification;

  useSub("rpc_notification.custom.customNotification", (notification: any) => {
    if (
      subsystemIndex !== undefined &&
      notification?.subsystemIndex === subsystemIndex
    ) {
      callbackRef.current(notification.payload);
    }
  });
}
