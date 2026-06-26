import { createContext } from "react";
import type { CustomSubsystemInfo } from "@zmkfirmware/zmk-studio-ts-client/custom";

export interface CustomSubsystemConnection {
  subsystemIndex: number;
  callRPC: (payload: Uint8Array) => Promise<Uint8Array>;
}

export const CustomSubsystemsContext = createContext<CustomSubsystemInfo[]>([]);
