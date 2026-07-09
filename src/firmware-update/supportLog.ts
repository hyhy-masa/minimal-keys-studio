// Support-log export (S1.12b, Codex-review-10 Critical-2).
//
// The recovery panel's third mode tells the customer "save a log and send it to
// support". That instruction must correspond to a real artifact — a previous
// build shipped the wording without the implementation (06 C6), so here the log
// is a first-class, tested deliverable. The saved JSON carries everything a
// remote diagnosis needs: detected volumes (incl. the full INFO_UF2.TXT and
// board_id the bootloader exposes), the manifest version + asset hashes, the
// reducer step history, the raw FlashError objects in order, and the OS / app /
// Tauri versions. Saving reuses Studio's existing `downloadJson` (Tauri save
// dialog + writeTextFile), so no new capabilities are required (S1.4 unchanged).

import { getVersion, getTauriVersion } from "@tauri-apps/api/app";
import { downloadJson } from "../keyboard/keymap-io";

/** A detected bootloader volume, as returned by the Rust `VolumeEntry`. */
export interface VolumeInfo {
  path: string;
  label: string;
  info_uf2: string | null;
  board_id: string | null;
}

/** One reducer transition, recorded for the support log. */
export interface StepLogEntry {
  ts: number;
  step: string;
  event: string;
}

export interface SupportLog {
  savedAt: string;
  app: {
    version: string | null;
    tauri: string | null;
    userAgent: string;
  };
  manifest: {
    version: string;
    assets: { role: string; name: string; sha256: string }[];
  } | null;
  /** Volumes seen during the session (scan + acquired bootloader), newest last. */
  volumes: VolumeInfo[];
  /** Reducer event history: what the customer did, in order. */
  steps: StepLogEntry[];
  /** Raw FlashError objects (pre-Japanese, the tagged `kind`/`detail`), in order. */
  errors: unknown[];
}

/** Mutable accumulator held in a ref by `useFirmwareUpdate`. */
export interface SupportLogAccumulator {
  manifest: SupportLog["manifest"];
  volumes: VolumeInfo[];
  steps: StepLogEntry[];
  errors: unknown[];
}

export function newSupportLogAccumulator(): SupportLogAccumulator {
  return { manifest: null, volumes: [], steps: [], errors: [] };
}

/** Compact `YYYYMMDD-HHmm` stamp for the filename (local time). */
function fileStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}`
  );
}

/** Resolve app/Tauri versions; tolerate a browser (non-Tauri) context. */
async function appVersions(): Promise<{ version: string | null; tauri: string | null }> {
  try {
    const [version, tauri] = await Promise.all([getVersion(), getTauriVersion()]);
    return { version, tauri };
  } catch {
    return { version: null, tauri: null };
  }
}

/**
 * Build the SupportLog snapshot and hand it to `downloadJson`. Returns false
 * when the user cancels the save dialog (so the UI can stay put), true on write.
 */
export async function exportSupportLog(acc: SupportLogAccumulator): Promise<boolean> {
  const now = new Date();
  const { version, tauri } = await appVersions();
  const log: SupportLog = {
    savedAt: now.toISOString(),
    app: { version, tauri, userAgent: navigator.userAgent },
    manifest: acc.manifest,
    volumes: acc.volumes,
    steps: acc.steps,
    errors: acc.errors,
  };
  return downloadJson(log, `support-log-${fileStamp(now)}.json`);
}
