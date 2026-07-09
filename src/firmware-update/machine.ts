// Wizard state machine (pure reducer). No Tauri/React imports so it is unit
// testable with vitest. The invariants that keep a customer safe live here:
//  - L can never be reached before R has flashed (structural R->L ordering).
//  - A settings_reset (GATT-change) release is HARD-BLOCKED in-app: the 4-stage
//    reset flow + Studio backup/restore are not implemented, so proceeding with
//    a normal 2-write flow would silently leave NVS inconsistent. Blocking is
//    safer than a half-done flow. (Codex C3 / debug H2)
//  - A tool older than the manifest's min_tool_version is blocked with guidance.
//  - Any dead-end funnels to recovery, never to a stuck state.

export const TOOL_VERSION = "0.1.0";

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

export type WizardState =
  | { step: "idle" }
  | { step: "fetching_manifest" }
  | { step: "show_release"; manifest: Manifest }
  | { step: "downloading"; manifest: Manifest }
  | { step: "r_confirm"; manifest: Manifest }
  | { step: "r_bootloader_guide"; manifest: Manifest }
  | { step: "r_flashing"; manifest: Manifest }
  | { step: "swap_to_l"; manifest: Manifest }
  | { step: "l_confirm"; manifest: Manifest }
  | { step: "l_bootloader_guide"; manifest: Manifest }
  | { step: "l_flashing"; manifest: Manifest }
  | { step: "verify_checklist"; manifest: Manifest }
  | { step: "done"; manifest: Manifest }
  | { step: "blocked"; reason: BlockReason }
  | { step: "error"; message: string; from: string }
  | { step: "recovery" };

export type BlockReason = "settings_reset_unsupported" | "tool_too_old";

export type WizardEvent =
  | { type: "START" }
  | { type: "FETCH_OK"; manifest: Manifest }
  | { type: "FETCH_ERR"; message: string }
  | { type: "PROCEED" }
  | { type: "DOWNLOAD_OK" }
  | { type: "DOWNLOAD_ERR"; message: string }
  | { type: "CONFIRM_R" }
  | { type: "BOOTLOADER_R" }
  | { type: "FLASH_R_OK" }
  | { type: "FLASH_R_ERR"; message: string }
  | { type: "SWAP_DONE" }
  | { type: "CONFIRM_L" }
  | { type: "BOOTLOADER_L" }
  | { type: "FLASH_L_OK" }
  | { type: "FLASH_L_ERR"; message: string }
  | { type: "CHECKLIST_OK" }
  | { type: "CHECKLIST_FAIL" }
  | { type: "ENTER_RECOVERY" }
  | { type: "RESET" };

export const initialState: WizardState = { step: "idle" };

function fail(from: string, message: string): WizardState {
  return { step: "error", message, from };
}

export function reduce(state: WizardState, event: WizardEvent): WizardState {
  if (event.type === "RESET") return initialState;
  if (event.type === "ENTER_RECOVERY") return { step: "recovery" };

  switch (state.step) {
    case "idle":
      if (event.type === "START") return { step: "fetching_manifest" };
      return state;

    case "fetching_manifest":
      if (event.type === "FETCH_OK") {
        const min = event.manifest.min_tool_version;
        if (min && !semverGe(TOOL_VERSION, min)) {
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
      if (event.type === "BOOTLOADER_R") return { step: "r_flashing", manifest: state.manifest };
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
      if (event.type === "BOOTLOADER_L") return { step: "l_flashing", manifest: state.manifest };
      return state;

    case "l_flashing":
      if (event.type === "FLASH_L_OK") return { step: "verify_checklist", manifest: state.manifest };
      if (event.type === "FLASH_L_ERR") return fail("l_flashing", event.message);
      return state;

    case "verify_checklist":
      if (event.type === "CHECKLIST_OK") return { step: "done", manifest: state.manifest };
      if (event.type === "CHECKLIST_FAIL") return { step: "recovery" };
      return state;

    case "done":
    case "blocked":
    case "error":
    case "recovery":
      return state;
  }
}

/** Apply a sequence of events; convenience for tests and drivers. */
export function run(events: WizardEvent[], from: WizardState = initialState): WizardState {
  return events.reduce(reduce, from);
}
