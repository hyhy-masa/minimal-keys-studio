// Wizard state machine (pure reducer). No Tauri/React imports so it is unit
// testable with vitest. The invariants that keep a customer safe live here:
//  - L can never be reached before R has flashed (structural R->L ordering).
//  - A settings_reset (GATT-change) release is HARD-BLOCKED in-app: the 4-stage
//    reset flow + Studio backup/restore are not implemented, so proceeding with
//    a normal 2-write flow would silently leave NVS inconsistent. Blocking is
//    safer than a half-done flow. (Codex C3 / debug H2)
//  - A tool older than the manifest's min_tool_version is blocked with guidance.
//  - Any dead-end funnels to recovery, never to a stuck state.

import { stripV } from "./versions";

export const TOOL_VERSION = "0.4.0";

export interface Manifest {
  schema: number;
  version: string;
  requires_settings_reset: boolean;
  notes_ja?: string | null;
  min_tool_version?: string | null;
}

/** Semver-lite: is `have` >= `need`? Numeric dot components; ignores pre-release. */
export function semverGe(have: string, need: string): boolean {
  const parts = (v: string): number[] => {
    const out: number[] = [];
    for (const seg of v.split(/[.\-+]/)) {
      if (seg === "" || !/^\d+$/.test(seg)) break;
      out.push(parseInt(seg, 10));
    }
    return out;
  };
  const h = parts(have);
  const n = parts(need);
  for (let i = 0; i < Math.max(h.length, n.length); i++) {
    const a = h[i] ?? 0;
    const b = n[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/** Which half of the split a recovery re-flash targets. R = central, L = peripheral. */
export type Side = "R" | "L";
export type VolumeOrigin = "existing" | "new";

export type WizardState =
  | { step: "idle" }
  | { step: "fetching_manifest" }
  | { step: "show_release"; manifest: Manifest }
  | { step: "downloading"; manifest: Manifest }
  | { step: "r_confirm"; manifest: Manifest }
  | { step: "r_bootloader_guide"; manifest: Manifest }
  | { step: "r_flash_confirm"; manifest: Manifest; origin: VolumeOrigin }
  | { step: "r_flashing"; manifest: Manifest }
  | { step: "swap_to_l"; manifest: Manifest }
  | { step: "l_confirm"; manifest: Manifest }
  | { step: "l_bootloader_guide"; manifest: Manifest }
  | { step: "l_flash_confirm"; manifest: Manifest; origin: VolumeOrigin }
  | { step: "l_flashing"; manifest: Manifest }
  | { step: "verify_checklist"; manifest: Manifest }
  | { step: "done"; manifest: Manifest }
  | { step: "blocked"; reason: BlockReason }
  | { step: "error"; message: string; from: string }
  // Recovery sub-flow (S1.12b). `from` is the re-drivable origin state that
  // "retry current step" (mode 1) returns to, or null when there is none.
  // `message` surfaces a failed one-side reflash. The sub-flow is intentionally
  // manifest-free: mode 2 re-acquires its own bootloader volume, so recovery
  // never needs to thread the manifest and stays a self-contained safety net.
  | { step: "recovery"; from: WizardState | null; message?: string }
  | { step: "recovery_waiting"; side: Side; from: WizardState | null }
  | { step: "recovery_flashing"; side: Side; from: WizardState | null }
  | { step: "recovery_done"; side: Side };

export type BlockReason = "settings_reset_unsupported" | "tool_too_old";

export type WizardEvent =
  | { type: "START" }
  | { type: "FETCH_OK"; manifest: Manifest }
  | { type: "FETCH_ERR"; message: string }
  | { type: "PROCEED" }
  | { type: "DOWNLOAD_OK" }
  | { type: "DOWNLOAD_ERR"; message: string }
  | { type: "CONFIRM_R" }
  | { type: "VOLUME_DETECTED_R"; origin: VolumeOrigin }
  | { type: "CONFIRM_WRITE_R" }
  | { type: "FLASH_R_OK" }
  | { type: "FLASH_R_ERR"; message: string }
  | { type: "SWAP_DONE" }
  | { type: "CONFIRM_L" }
  | { type: "VOLUME_DETECTED_L"; origin: VolumeOrigin }
  | { type: "CONFIRM_WRITE_L" }
  | { type: "FLASH_L_OK" }
  | { type: "FLASH_L_ERR"; message: string }
  | { type: "CHECKLIST_OK" }
  | { type: "CHECKLIST_FAIL" }
  | { type: "ENTER_RECOVERY"; message?: string }
  | { type: "RETRY_CURRENT_STEP" }
  | { type: "RECOVERY_FLASH_SIDE"; side: Side }
  | { type: "RECOVERY_VOLUME_OK" }
  | { type: "RECOVERY_FLASH_OK" }
  | { type: "RECOVERY_FLASH_ERR"; message: string }
  | { type: "RESET" };

export const initialState: WizardState = { step: "idle" };

function fail(from: string, message: string): WizardState {
  return { step: "error", message, from };
}

/**
 * The origin state that "retry current step" (recovery mode 1) returns to.
 * Only steps that meaningfully re-drive on re-entry qualify (bootloader waits,
 * confirms, the checklist, the swap prompt). Flashing/terminal/error states are
 * excluded: a failed write is re-driven through mode 2 (flash_one_side), which
 * re-acquires the volume safely, not by blindly re-writing.
 */
function redrivableOrigin(state: WizardState): WizardState | null {
  switch (state.step) {
    case "downloading":
    case "r_confirm":
    case "r_bootloader_guide":
    case "swap_to_l":
    case "l_confirm":
    case "l_bootloader_guide":
    case "verify_checklist":
      return state;
    default:
      return null;
  }
}

/** Enter recovery, preserving the retry-origin when already inside the sub-flow. */
function recoveryState(from: WizardState | null, message?: string): WizardState {
  return message === undefined ? { step: "recovery", from } : { step: "recovery", from, message };
}

function enterRecovery(state: WizardState, message?: string): WizardState {
  switch (state.step) {
    case "recovery":
      return message === undefined ? state : { ...state, message };
    case "recovery_waiting":
    case "recovery_flashing":
      return recoveryState(state.from, message);
    case "recovery_done":
      return recoveryState(null, message);
    default:
      return recoveryState(redrivableOrigin(state), message);
  }
}

export function reduce(state: WizardState, event: WizardEvent): WizardState {
  if (event.type === "RESET") return initialState;
  if (event.type === "ENTER_RECOVERY") return enterRecovery(state, event.message);

  switch (state.step) {
    case "idle":
      if (event.type === "START") return { step: "fetching_manifest" };
      return state;

    case "fetching_manifest":
      if (event.type === "FETCH_OK") {
        const min = event.manifest.min_tool_version;
        // Strip a leading "v" on BOTH sides: manifests carry "v1.4.0"-style tags
        // (see versions.ts / manifest.rs), and without this the semver-lite parse
        // hits the non-numeric "v" segment, yields [], and silently treats the
        // gate as "no constraint" — letting an out-of-date tool proceed. (M-2)
        if (min && !semverGe(stripV(TOOL_VERSION), stripV(min))) {
          return { step: "blocked", reason: "tool_too_old" };
        }
        return { step: "show_release", manifest: event.manifest };
      }
      if (event.type === "FETCH_ERR") return fail("fetching_manifest", event.message);
      return state;

    case "show_release":
      if (event.type === "PROCEED") {
        // Hard-block GATT-change releases in-app (see file header).
        return state.manifest.requires_settings_reset
          ? { step: "blocked", reason: "settings_reset_unsupported" }
          : { step: "downloading", manifest: state.manifest };
      }
      return state;

    case "downloading":
      if (event.type === "DOWNLOAD_OK") return { step: "r_confirm", manifest: state.manifest };
      if (event.type === "DOWNLOAD_ERR") return fail("downloading", event.message);
      return state;

    case "r_confirm":
      if (event.type === "CONFIRM_R") return { step: "r_bootloader_guide", manifest: state.manifest };
      return state;

    case "r_bootloader_guide":
      if (event.type === "VOLUME_DETECTED_R")
        return { step: "r_flash_confirm", manifest: state.manifest, origin: event.origin };
      return state;

    case "r_flash_confirm":
      if (event.type === "CONFIRM_WRITE_R") return { step: "r_flashing", manifest: state.manifest };
      return state;

    case "r_flashing":
      if (event.type === "FLASH_R_OK") return { step: "swap_to_l", manifest: state.manifest };
      if (event.type === "FLASH_R_ERR") return fail("r_flashing", event.message);
      return state;

    case "swap_to_l":
      if (event.type === "SWAP_DONE") return { step: "l_confirm", manifest: state.manifest };
      return state;

    case "l_confirm":
      if (event.type === "CONFIRM_L") return { step: "l_bootloader_guide", manifest: state.manifest };
      return state;

    case "l_bootloader_guide":
      if (event.type === "VOLUME_DETECTED_L")
        return { step: "l_flash_confirm", manifest: state.manifest, origin: event.origin };
      return state;

    case "l_flash_confirm":
      if (event.type === "CONFIRM_WRITE_L") return { step: "l_flashing", manifest: state.manifest };
      return state;

    case "l_flashing":
      if (event.type === "FLASH_L_OK") return { step: "verify_checklist", manifest: state.manifest };
      if (event.type === "FLASH_L_ERR") return fail("l_flashing", event.message);
      return state;

    case "verify_checklist":
      if (event.type === "CHECKLIST_OK") return { step: "done", manifest: state.manifest };
      if (event.type === "CHECKLIST_FAIL") return { step: "recovery", from: state };
      return state;

    case "recovery":
      if (event.type === "RECOVERY_FLASH_SIDE")
        return { step: "recovery_waiting", side: event.side, from: state.from };
      if (event.type === "RETRY_CURRENT_STEP") return state.from ?? state;
      return state;

    case "recovery_waiting":
      if (event.type === "RECOVERY_VOLUME_OK")
        return { step: "recovery_flashing", side: state.side, from: state.from };
      if (event.type === "RECOVERY_FLASH_ERR")
        return { step: "recovery", from: state.from, message: event.message };
      return state;

    case "recovery_flashing":
      if (event.type === "RECOVERY_FLASH_OK") return { step: "recovery_done", side: state.side };
      if (event.type === "RECOVERY_FLASH_ERR")
        return { step: "recovery", from: state.from, message: event.message };
      return state;

    case "done":
    case "blocked":
    case "error":
    case "recovery_done":
      return state;
  }
}

/** Apply a sequence of events; convenience for tests and drivers. */
export function run(events: WizardEvent[], from: WizardState = initialState): WizardState {
  return events.reduce(reduce, from);
}

/** Whether the modal may be dismissed from a given wizard step. */
export function canCloseStep(step: WizardState["step"]): boolean {
  return (
    step === "idle" ||
    step === "show_release" ||
    step === "done" ||
    step === "blocked" ||
    step === "error" ||
    step === "recovery" ||
    step === "recovery_waiting" ||
    step === "recovery_done"
  );
}
