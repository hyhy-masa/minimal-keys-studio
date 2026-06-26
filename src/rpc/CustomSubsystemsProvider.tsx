import { useContext, useEffect, useState } from "react";
import { ConnectionContext } from "./ConnectionContext";
import { call_rpc } from "./logging";
import type { CustomSubsystemInfo } from "@zmkfirmware/zmk-studio-ts-client/custom";
import { LockStateContext } from "./LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { CustomSubsystemsContext } from "./CustomSubsystemsContext";

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
