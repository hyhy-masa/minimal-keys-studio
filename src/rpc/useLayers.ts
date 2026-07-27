import { useContext, useEffect, useState } from "react";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { ConnectionContext } from "./ConnectionContext";
import { LockStateContext } from "./LockStateContext";
import { call_rpc } from "./logging";
import type { LayerDisplay } from "./layerTypes";

export function useLayers(): LayerDisplay[] {
  const connection = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const [layers, setLayers] = useState<LayerDisplay[]>([]);

  useEffect(() => {
    if (
      !connection.conn ||
      lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setLayers([]);
      return;
    }

    let ignore = false;

    async function load() {
      if (!connection.conn) return;
      const resp = await call_rpc(connection.conn, {
        keymap: { getKeymap: true },
      });
      if (ignore) return;

      const km = resp?.keymap?.getKeymap;
      if (km?.layers) {
        setLayers(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          km.layers.map((l: any, i: number) => ({
            id: l.id ?? i,
            index: i,
            name: l.name || `Layer ${i}`,
          }))
        );
      }
    }

    load();
    return () => { ignore = true; };
  }, [connection, lockState]);

  return layers;
}
