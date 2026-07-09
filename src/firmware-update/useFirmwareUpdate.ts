import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { reduce, initialState, type Manifest, type WizardEvent } from "./machine";
import { formatError } from "./ja";

// Default = the public GitHub Releases manifest. Overridable via
// VITE_MK_MANIFEST_URL for dev / staging / local test releases.
const MANIFEST_URL =
  import.meta.env.VITE_MK_MANIFEST_URL ??
  "https://github.com/hyhy-masa/minimal-keys-farmware/releases/latest/download/manifest.json";

interface Asset {
  role: string;
  name: string;
  url: string;
  sha256: string;
  size: number;
  build_target?: string;
  target_addr_min?: string;
  target_addr_max?: string;
}

interface FullManifest extends Manifest {
  assets: Asset[];
}

export interface Progress {
  phase: string;
  detail?: { written?: number; total?: number; attempt?: number };
}

/**
 * Drives the wizard: pure transitions come from the reducer, side effects
 * (manifest fetch, download, bootloader wait, write) are fired by an effect
 * keyed on `state.step`. All hardware work — and all UF2 validation and the
 * Board-ID gate — happens in the (tested) Rust core; this hook only marshals.
 */
export function useFirmwareUpdate() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [progress, setProgress] = useState<Progress | null>(null);
  const manifestRef = useRef<FullManifest | null>(null);
  const pathsRef = useRef<Record<string, string>>({});
  const volumeRef = useRef<string>("");

  const start = useCallback(async () => {
    setProgress(null);
    dispatch({ type: "START" });
    try {
      const m = await invoke<FullManifest>("fw_fetch_manifest", { url: MANIFEST_URL });
      manifestRef.current = m;
      dispatch({ type: "FETCH_OK", manifest: m });
    } catch (e) {
      dispatch({ type: "FETCH_ERR", message: formatError(e) });
    }
  }, []);

  // Cancel the current operation. `flash_cancel` cooperatively unblocks a
  // waiting Rust op (bootloader wait) so its BusyGuard is released immediately;
  // download has no cancel token, so a cancel there is a UI-only reset (the
  // background download finishes into cache and is simply discarded). RESET
  // trips the effect cleanup's `cancelled` guard so no late dispatch lands.
  // The UI must only expose this while NOT writing (⑤⑧ keep it disabled).
  const cancel = useCallback(() => {
    void invoke("flash_cancel").catch(() => {});
    dispatch({ type: "RESET" });
  }, []);

  useEffect(() => {
    const m = manifestRef.current;
    if (!m) return;
    let cancelled = false;

    const download = async () => {
      try {
        // The command resolves the destination inside the app cache dir; the
        // frontend never passes a (CWD-relative) path.
        for (const role of ["central", "peripheral"]) {
          const a = m.assets.find((x) => x.role === role);
          if (!a) continue;
          const p = await invoke<string>("fw_download_asset", { asset: a });
          pathsRef.current[role] = p;
        }
        if (!cancelled) dispatch({ type: "DOWNLOAD_OK" });
      } catch (e) {
        if (!cancelled) dispatch({ type: "DOWNLOAD_ERR", message: formatError(e) });
      }
    };

    const waitBootloader = async (onDetected: WizardEvent) => {
      try {
        const vols = await invoke<{ path: string }[]>("flash_scan_volumes");
        const baseline = vols.map((v) => v.path);
        const vol = await invoke<{ path: string }>("flash_wait_for_bootloader", {
          baseline,
          timeoutSecs: 60,
        });
        volumeRef.current = vol.path;
        if (!cancelled) dispatch(onDetected);
      } catch (e) {
        console.error(e);
        if (!cancelled) dispatch({ type: "ENTER_RECOVERY" });
      }
    };

    const flash = async (
      role: "central" | "peripheral",
      ok: WizardEvent,
      errType: "FLASH_R_ERR" | "FLASH_L_ERR"
    ) => {
      const asset = m.assets.find((x) => x.role === role);
      try {
        const ch = new Channel<Progress>();
        ch.onmessage = (msg) => setProgress(msg);
        await invoke<unknown>("flash_write_uf2", {
          volume: volumeRef.current,
          filename: role === "central" ? "minimal-keys_R.uf2" : "minimal-keys_L.uf2",
          uf2Path: pathsRef.current[role] ?? "",
          sha256: asset?.sha256 ?? "",
          targetAddrMin: asset?.target_addr_min ?? null,
          targetAddrMax: asset?.target_addr_max ?? null,
          onProgress: ch,
        });
        if (!cancelled) dispatch(ok);
      } catch (e) {
        if (!cancelled) dispatch({ type: errType, message: formatError(e) });
      }
    };

    switch (state.step) {
      case "downloading":
        void download();
        break;
      case "r_bootloader_guide":
        void waitBootloader({ type: "BOOTLOADER_R" });
        break;
      case "r_flashing":
        void flash("central", { type: "FLASH_R_OK" }, "FLASH_R_ERR");
        break;
      case "l_bootloader_guide":
        void waitBootloader({ type: "BOOTLOADER_L" });
        break;
      case "l_flashing":
        void flash("peripheral", { type: "FLASH_L_OK" }, "FLASH_L_ERR");
        break;
      default:
        break;
    }
    return () => {
      cancelled = true;
    };
  }, [state.step]);

  return { state, progress, start, cancel, dispatch };
}
