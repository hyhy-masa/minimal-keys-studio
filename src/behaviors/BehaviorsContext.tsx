import { createContext, useContext, useEffect, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { call_rpc } from "../rpc/logging";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

interface BehaviorsState {
  map: BehaviorMap;
  list: GetBehaviorDetailsResponse[];
}

const BehaviorsContext = createContext<BehaviorsState>({ map: {}, list: [] });

// eslint-disable-next-line react-refresh/only-export-components
export function useBehaviorMap(): BehaviorMap {
  return useContext(BehaviorsContext).map;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBehaviorList(): GetBehaviorDetailsResponse[] {
  return useContext(BehaviorsContext).list;
}

export function BehaviorsProvider({ children }: { children: React.ReactNode }) {
  const connection = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const [state, setState] = useState<BehaviorsState>({ map: {}, list: [] });

  useEffect(() => {
    if (
      !connection.conn ||
      lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setState({ map: {}, list: [] });
      return;
    }

    let ignore = false;

    async function load() {
      if (!connection.conn) return;

      setState({ map: {}, list: [] });

      const resp = await call_rpc(connection.conn, {
        behaviors: { listAllBehaviors: true },
      });
      if (ignore) return;

      const behaviorIds =
        resp.behaviors?.listAllBehaviors?.behaviors ?? [];

      const map: BehaviorMap = {};
      const list: GetBehaviorDetailsResponse[] = [];

      for (const behaviorId of behaviorIds) {
        if (ignore) break;
        const detail = await call_rpc(connection.conn!, {
          behaviors: { getBehaviorDetails: { behaviorId } },
        });
        const dets = detail?.behaviors?.getBehaviorDetails;
        if (dets) {
          map[dets.id] = dets;
          list.push(dets);
        }
      }

      if (!ignore) setState({ map, list });
    }

    load();
    return () => {
      ignore = true;
    };
  }, [connection, lockState]);

  return (
    <BehaviorsContext.Provider value={state}>
      {children}
    </BehaviorsContext.Provider>
  );
}
