import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCustomSubsystem } from "../rpc/useCustomSubsystem";
import * as Macros from "../proto/macros";
import { readAll, type RpcCall, type StoredMacro } from "./macro-client";
import { MacrosContext, type MacrosContextValue, type MacrosStatus } from "./MacrosContext";

/**
 * Loads the macros once per connection. The macro tab, the key picker and the
 * key labels all read from here, so a save in one place shows everywhere.
 */
export function MacrosProvider({ children }: { children: ReactNode }) {
  const subsystem = useCustomSubsystem(Macros.SUBSYSTEM_ID);
  const [status, setStatus] = useState<MacrosStatus>("unavailable");
  const [info, setInfo] = useState<Macros.MacroInfo | null>(null);
  const [macros, setMacros] = useState<StoredMacro[]>([]);
  const versionRef = useRef(0);

  const call = useMemo<RpcCall | null>(
    () => (subsystem ? (payload, timeoutMs) => subsystem.callRPC(payload, timeoutMs) : null),
    [subsystem],
  );

  const load = useCallback(async () => {
    const version = ++versionRef.current;
    if (!call) {
      setStatus("unavailable");
      setInfo(null);
      setMacros([]);
      return;
    }
    // A refresh after a save keeps the screen; only the first read shows "loading".
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      const result = await readAll(call);
      if (version !== versionRef.current) return;
      setInfo(result.info);
      setMacros(result.macros);
      setStatus("ready");
    } catch (e) {
      if (version !== versionRef.current) return;
      console.error("[Macros] Failed to load:", e);
      setStatus("error");
    }
  }, [call]);

  // A new connection (or a new subsystem index) starts from an empty list.
  useEffect(() => {
    setInfo(null);
    setMacros([]);
    setStatus(call ? "loading" : "unavailable");
    void load();
  }, [call, load]);

  const value = useMemo<MacrosContextValue>(
    () => ({ status, info, macros, refresh: load, call }),
    [status, info, macros, load, call],
  );

  return <MacrosContext.Provider value={value}>{children}</MacrosContext.Provider>;
}
