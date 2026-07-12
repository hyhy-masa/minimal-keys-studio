// Recovery side effects (S1.12b), deliberately kept OUT of the normal-flow
// effect switch in `useFirmwareUpdate` (Codex-review-10 suggestion). The three
// recovery modes each map to one action here:
//   ① retry current step  → dispatch RETRY_CURRENT_STEP (pure, no I/O)
//   ② flash one side       → flashOneSide(side): re-acquire volume + write
//   ③ export support log    → exportLog(): save the accumulated SupportLog
//
// flashOneSide re-uses the SAME Rust commands as the normal flow, so the write
// still passes validate_uf2 / SHA / address-window / Board-ID preflight — the
// safety gates are never dropped on the recovery path (design 08 S1.12b).

import { useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { formatError } from "./ja";
import type { WizardEvent, Side } from "./machine";
import type { Progress, Asset, FullManifest, AcquiredVolume } from "./useFirmwareUpdate";
import { exportSupportLog, type SupportLogAccumulator, type VolumeInfo } from "./supportLog";

const ROLE_BY_SIDE: Record<Side, "central" | "peripheral"> = { R: "central", L: "peripheral" };
const FILE_BY_SIDE: Record<Side, string> = { R: "minimal-keys_R.uf2", L: "minimal-keys_L.uf2" };

export interface RecoveryContext {
  dispatch: (e: WizardEvent) => void;
  setProgress: (p: Progress | null) => void;
  manifestRef: { current: FullManifest | null };
  pathsRef: { current: Record<string, string> };
  accRef: { current: SupportLogAccumulator };
  recordVolume: (v: VolumeInfo) => void;
  recordError: (e: unknown) => void;
}

export interface RecoveryActions {
  retryCurrentStep: () => void;
  flashOneSide: (side: Side) => Promise<void>;
  exportLog: () => Promise<boolean>;
}

export function useRecoveryActions(ctx: RecoveryContext): RecoveryActions {
  const { dispatch, setProgress, manifestRef, pathsRef, accRef, recordVolume, recordError } = ctx;

  const retryCurrentStep = useCallback(() => {
    dispatch({ type: "RETRY_CURRENT_STEP" });
  }, [dispatch]);

  const flashOneSide = useCallback(
    async (side: Side) => {
      const role = ROLE_BY_SIDE[side];
      const asset: Asset | undefined = manifestRef.current?.assets.find((a) => a.role === role);
      setProgress(null);
      dispatch({ type: "RECOVERY_FLASH_SIDE", side });
      try {
        // Recovery can start before the normal download ran, so fetch the side's
        // UF2 on demand if it is not already cached.
        let uf2Path = pathsRef.current[role];
        if (!uf2Path) {
          if (!asset) throw new Error("この側のファームウェアが見つかりませんでした。");
          uf2Path = await invoke<string>("fw_download_asset", { asset });
          pathsRef.current[role] = uf2Path;
        }
        // baseline=[] → acquire_bootloader adopts an already-mounted, Board-ID
        // matching single volume (design 09 §6.4②, flasher volume.rs:64-95): the
        // impatient-customer trap (reset the half before the guide screen) is
        // handled without needing a "new" volume to appear.
        const acquired = await invoke<AcquiredVolume>("flash_wait_for_bootloader", {
          baseline: [],
          adoptPresent: true,
          timeoutSecs: 60,
        });
        recordVolume(acquired.volume);
        dispatch({ type: "RECOVERY_VOLUME_OK" });

        const ch = new Channel<Progress>();
        ch.onmessage = (msg) => setProgress(msg);
        await invoke<unknown>("flash_write_uf2", {
          volume: acquired.volume.path,
          filename: FILE_BY_SIDE[side],
          uf2Path,
          sha256: asset?.sha256 ?? "",
          targetAddrMin: asset?.target_addr_min ?? null,
          targetAddrMax: asset?.target_addr_max ?? null,
          onProgress: ch,
        });
        dispatch({ type: "RECOVERY_FLASH_OK" });
      } catch (e) {
        recordError(e);
        dispatch({ type: "RECOVERY_FLASH_ERR", message: formatError(e) });
      }
    },
    [dispatch, setProgress, manifestRef, pathsRef, recordVolume, recordError]
  );

  const exportLog = useCallback(() => exportSupportLog(accRef.current), [accRef]);

  return { retryCurrentStep, flashOneSide, exportLog };
}
