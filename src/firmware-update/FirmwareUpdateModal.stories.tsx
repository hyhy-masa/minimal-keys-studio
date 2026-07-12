/**
 * TEMPORARY story file (2026-07-12) — created only to render each
 * FirmwareUpdateModal wizard screen for a visual screenshot review.
 *
 * FirmwareUpdateModal.tsx itself pulls its state from `useFirmwareUpdate()`
 * (Tauri `invoke`) and `useFirmwareVersion()` (a live RPC subsystem handle),
 * neither of which exist outside the real Tauri app / connected keyboard.
 * This file instead renders the shared presentational WizardBody with dummy
 * WizardState values and actions, leaving the reviewed product hooks unchanged.
 *
 * Not wired into the app; safe to delete after the screenshot review.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "react-aria-components";
import { X } from "lucide-react";
import { GenericModal } from "../GenericModal";
import { useModalRef } from "../misc/useModalRef";
import { canCloseStep, type WizardState, type Manifest } from "./machine";
import { stepTitle } from "./ja";
import { WizardBody } from "./WizardBody";
import type { Progress } from "./useFirmwareUpdate";
import type { RecoveryActions } from "./useRecoveryActions";

const noop = () => {};
const dummyRecovery: RecoveryActions = {
  retryCurrentStep: noop,
  flashOneSide: async () => {},
  exportLog: async () => true,
};

function Screen({
  state,
  progress = null,
  fwVersion = null,
  fwSupported = false,
  dark = false,
}: {
  state: WizardState;
  progress?: Progress | null;
  fwVersion?: string | null;
  fwSupported?: boolean;
  dark?: boolean;
}) {
  const ref = useModalRef(true);
  const canClose = canCloseStep(state.step);

  return (
    <div
      style={{
        colorScheme: dark ? "dark" : "light",
        background: dark ? "#0f1216" : "#eef0f2",
        minHeight: "100vh",
        width: "100%",
        padding: "3rem 1rem",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <GenericModal ref={ref} className="w-[min(560px,92vw)] max-h-[85vh] overflow-y-auto" onClose={noop}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{stepTitle[state.step]}</h2>
          {canClose && (
            <Button onPress={noop} aria-label="閉じる" className="p-1 rounded hover:bg-base-300">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <WizardBody
          state={state}
          progress={progress}
          fw={{ version: fwVersion, supported: fwSupported }}
          dispatch={noop}
          cancel={noop}
          onClose={noop}
          start={async () => {}}
          recovery={dummyRecovery}
        />
      </GenericModal>
    </div>
  );
}

const manifest: Manifest = {
  schema: 1,
  version: "1.5.0",
  requires_settings_reset: false,
  notes_ja: "・トラックボールの感度を改善\n・BLE接続が切れにくくなりました\n・マクロキーの不具合を修正",
  min_tool_version: null,
};

const flashingProgress: Progress = {
  phase: "writing",
  detail: { written: 45000, total: 71000, attempt: 1 },
};

const meta: Meta<typeof Screen> = {
  title: "Firmware Update/Wizard Screens",
  component: Screen,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof Screen>;

function pair(name: string, props: Omit<Parameters<typeof Screen>[0], "dark">): Record<string, Story> {
  return {
    [name]: { render: () => <Screen {...props} dark={false} /> },
    [`${name}Dark`]: { render: () => <Screen {...props} dark={true} /> },
  };
}

const stories: Record<string, Story> = {
  ...pair("Idle", { state: { step: "idle" } }),
  ...pair("ShowRelease", {
    state: { step: "show_release", manifest },
    fwVersion: null,
    fwSupported: false,
  }),
  ...pair("BootloaderGuideR", { state: { step: "r_bootloader_guide", manifest } }),
  ...pair("BootloaderGuideL", { state: { step: "l_bootloader_guide", manifest } }),
  ...pair("Flashing", { state: { step: "r_flashing", manifest }, progress: flashingProgress }),
  ...pair("SwapToL", { state: { step: "swap_to_l", manifest } }),
  ...pair("VerifyChecklist", { state: { step: "verify_checklist", manifest } }),
  ...pair("Done", { state: { step: "done", manifest }, fwVersion: "1.5.0", fwSupported: false }),
  ...pair("Blocked", { state: { step: "blocked", reason: "settings_reset_unsupported" } }),
  ...pair("Error", {
    state: {
      step: "error",
      message: "書き込みが最後まで完了しませんでした。ケーブルを挿し直し、もう一度お試しください。",
      from: "r_flashing",
    },
  }),
  ...pair("Recovery", {
    state: { step: "recovery", from: { step: "r_bootloader_guide", manifest } },
  }),
};

export const Idle = stories.Idle;
export const IdleDark = stories.IdleDark;
export const ShowRelease = stories.ShowRelease;
export const ShowReleaseDark = stories.ShowReleaseDark;
export const BootloaderGuideR = stories.BootloaderGuideR;
export const BootloaderGuideRDark = stories.BootloaderGuideRDark;
export const BootloaderGuideL = stories.BootloaderGuideL;
export const BootloaderGuideLDark = stories.BootloaderGuideLDark;
export const Flashing = stories.Flashing;
export const FlashingDark = stories.FlashingDark;
export const SwapToL = stories.SwapToL;
export const SwapToLDark = stories.SwapToLDark;
export const VerifyChecklist = stories.VerifyChecklist;
export const VerifyChecklistDark = stories.VerifyChecklistDark;
export const Done = stories.Done;
export const DoneDark = stories.DoneDark;
export const Blocked = stories.Blocked;
export const BlockedDark = stories.BlockedDark;
export const Error_ = stories.Error;
export const ErrorDark = stories.ErrorDark;
export const Recovery = stories.Recovery;
export const RecoveryDark = stories.RecoveryDark;
