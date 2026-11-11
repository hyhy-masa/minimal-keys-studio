import { createContext, useContext } from "react";
import type * as Macros from "../proto/macros";
import type { RpcCall, StoredMacro } from "./macro-client";

// Kept apart from MacrosProvider so the keymap, the picker and their tests can
// read macros without pulling in the RPC connection code.

/**
 * - unavailable: the firmware has no mk__macros subsystem (or no connection)
 * - loading:     the list is being read
 * - error:       the list could not be read
 * - ready:       info and every stored macro are known
 */
export type MacrosStatus = "unavailable" | "loading" | "error" | "ready";

export interface MacrosContextValue {
  status: MacrosStatus;
  info: Macros.MacroInfo | null;
  macros: StoredMacro[];
  /** Reads the list again. Resolves when the read has finished (or failed). */
  refresh: () => Promise<void>;
  call: RpcCall | null;
}

export const MacrosContext = createContext<MacrosContextValue>({
  status: "unavailable",
  info: null,
  macros: [],
  refresh: async () => {},
  call: null,
});

export function useMacros(): MacrosContextValue {
  return useContext(MacrosContext);
}
