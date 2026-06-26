import { useCallback, useContext, useMemo, useRef } from "react";
import { ConnectionContext } from "./ConnectionContext";
import { call_rpc } from "./logging";
import { useSub } from "../usePubSub";
import { CustomSubsystemsContext } from "./CustomSubsystemsContext";
import type { CustomSubsystemConnection } from "./CustomSubsystemsContext";

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
