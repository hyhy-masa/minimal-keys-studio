import React, {
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ConnectionContext } from "./ConnectionContext";

import { call_rpc } from "./logging";

import { Request, RequestResponse } from "@zmkfirmware/zmk-studio-ts-client";
import { LockStateContext } from "./LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";

export function useConnectedDeviceData<T>(
  req: Omit<Request, "requestId">,
  response_mapper: (resp: RequestResponse) => T | undefined,
  requireUnlock?: boolean
): [
  T | undefined,
  React.Dispatch<SetStateAction<T | undefined>>,
  boolean,
  () => void,
] {
  const connection = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const retry = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(
    () => {
      if (
        !connection.conn ||
        (requireUnlock &&
          lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED)
      ) {
        setData(undefined);
        setError(false);
        return;
      }

      async function startRequest() {
        setData(undefined);
        setError(false);
        if (!connection.conn) {
          return;
        }

        try {
          const response = response_mapper(
            await call_rpc(connection.conn, req)
          );

          if (!ignore) {
            setData(response);
          }
        } catch (e) {
          console.error("Failed to load device data:", e);
          if (!ignore) {
            setError(true);
          }
        }
      }

      let ignore = false;
      startRequest();

      return () => {
        ignore = true;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    requireUnlock
      ? [connection, requireUnlock, lockState, reloadToken]
      : [connection, requireUnlock, reloadToken]
  );

  return [data, setData, error, retry];
}
