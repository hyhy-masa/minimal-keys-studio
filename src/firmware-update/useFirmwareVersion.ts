import { useCallback, useEffect, useState } from "react";
import { useCustomSubsystem } from "../rpc/useCustomSubsystem";
import {
  SUBSYSTEM_ID,
  encodeGetFirmwareInfoRequest,
  decodeFirmwareInfoResponse,
  pickCentralVersion,
  type FirmwareInfo,
} from "./proto/fwinfo";

export interface FirmwareVersionState {
  /** Does the connected firmware advertise the `zmk__fwinfo` subsystem? */
  supported: boolean;
  /** Central half's firmware version, or null when unsupported/unknown. */
  version: string | null;
  /** All reported halves (central first). Empty until read / when unsupported. */
  infos: FirmwareInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Forward-compatible reader of the connected keyboard's installed firmware
 * version. Today no shipped firmware advertises `zmk__fwinfo`, so `supported`
 * is false and `version` stays null ("お使いのバージョン: 不明"). The moment a
 * firmware that DOES advertise it is flashed and connected, `useCustomSubsystem`
 * returns a live handle and this hook starts reporting the real version — with
 * no change to Studio. (See proto/fwinfo.ts for the frozen wire format.)
 */
export function useFirmwareVersion(): FirmwareVersionState {
  const subsystem = useCustomSubsystem(SUBSYSTEM_ID);
  const supported = subsystem !== null;
  const [version, setVersion] = useState<string | null>(null);
  const [infos, setInfos] = useState<FirmwareInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!subsystem) {
      setVersion(null);
      setInfos([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await subsystem.callRPC(encodeGetFirmwareInfoRequest(true), 4000);
      const decoded = decodeFirmwareInfoResponse(resp);
      if (decoded.error) {
        setError(decoded.error);
        setVersion(null);
        setInfos([]);
      } else {
        setInfos(decoded.firmwareInfo);
        setVersion(pickCentralVersion(decoded.firmwareInfo));
      }
    } catch (e) {
      setError(String(e));
      setVersion(null);
      setInfos([]);
    } finally {
      setLoading(false);
    }
  }, [subsystem]);

  // Auto-read once the subsystem becomes available. On current firmware this
  // never fires (subsystem stays null); it wakes up when a fwinfo-capable
  // firmware connects.
  useEffect(() => {
    if (subsystem) {
      void refresh();
    } else {
      setVersion(null);
      setInfos([]);
      setError(null);
    }
  }, [subsystem, refresh]);

  return { supported, version, infos, loading, error, refresh };
}
