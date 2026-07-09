import { useEffect, type ReactNode } from "react";
import { Button } from "react-aria-components";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { GenericModal } from "../GenericModal";
import { useModalRef } from "../misc/useModalRef";
import { useFirmwareUpdate, type Progress } from "./useFirmwareUpdate";
import { useFirmwareVersion } from "./useFirmwareVersion";
import { isUpdateAvailable } from "./versions";
import { stepTitle, blockReasonText } from "./ja";
import { ProgressBar } from "./ProgressBar";
import { RecoveryPanel } from "./RecoveryPanel";

function progressPct(p: Progress | null): number {
  const total = p?.detail?.total ?? 0;
  const written = p?.detail?.written ?? 0;
  return total > 0 ? Math.round((written / total) * 100) : 0;
}

function PrimaryButton({
  onPress,
  isDisabled,
  children,
}: {
  onPress: () => void;
  isDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      onPress={onPress}
      isDisabled={isDisabled}
      className="rounded bg-primary text-primary-content px-4 py-2 hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </Button>
  );
}

function GhostButton({
  onPress,
  isDisabled,
  children,
}: {
  onPress: () => void;
  isDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      onPress={onPress}
      isDisabled={isDisabled}
      className="rounded bg-base-200 hover:bg-base-300 px-3 py-2 disabled:opacity-50"
    >
      {children}
    </Button>
  );
}

/**
 * Placeholder bootloader-guide illustration. A simple keyboard-half outline with
 * a reset-button marker — swapped for a real photo (assets A1-A4) before MVP
 * sign-off (design 09 §3.4). The marker/label are the swappable part.
 */
function GuideDiagram({ side }: { side: "R" | "L" }) {
  return (
    <div className="my-3 rounded-lg border border-base-300 bg-base-200 p-4 flex flex-col items-center gap-2">
      <svg viewBox="0 0 160 90" className="w-40 h-24" aria-hidden>
        <rect x="4" y="4" width="152" height="82" rx="10" className="fill-base-100 stroke-base-300" strokeWidth="2" />
        <circle cx={side === "R" ? 120 : 40} cy="45" r="9" className="fill-danger" />
        <circle cx={side === "R" ? 120 : 40} cy="45" r="15" className="fill-none stroke-danger" strokeWidth="2" />
      </svg>
      <p className="text-sm text-base-content/60 text-center">
        {side === "R" ? "右" : "左"}半分のリセットボタン（実機写真は準備中）
      </p>
    </div>
  );
}

function WriteWarning() {
  return (
    <div className="my-3 flex items-start gap-2 rounded bg-warning text-warning-content p-2 text-sm">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>ケーブルを抜いたり、アプリを閉じたりしないでください。</span>
    </div>
  );
}

export interface FirmwareUpdateModalProps {
  open: boolean;
  onClose: () => void;
}

export function FirmwareUpdateModal({ open, onClose }: FirmwareUpdateModalProps) {
  const { state, progress, start, cancel, dispatch, recovery } = useFirmwareUpdate();
  const fw = useFirmwareVersion();

  const flashing =
    state.step === "r_flashing" ||
    state.step === "l_flashing" ||
    state.step === "recovery_flashing";
  const ref = useModalRef(open, false, !flashing);

  // Fresh start every time the modal opens.
  useEffect(() => {
    if (open) dispatch({ type: "RESET" });
  }, [open, dispatch]);

  const handleClose = () => {
    cancel();
    onClose();
  };

  const canClose =
    state.step === "idle" ||
    state.step === "show_release" ||
    state.step === "done" ||
    state.step === "blocked" ||
    state.step === "error" ||
    state.step === "recovery" ||
    state.step === "recovery_waiting" ||
    state.step === "recovery_done";

  const currentVersion = fw.version ?? "不明";

  const body = (() => {
    switch (state.step) {
      case "idle":
        return (
          <div>
            <p className="text-sm text-base-content/70 mb-3">
              最新のファームウェアが出ているか確認します。
              <span className="block text-sm text-base-content/50 mt-1">
                ファームウェア＝キーボードの中身のプログラム
              </span>
            </p>
            <div className="flex justify-end">
              <PrimaryButton onPress={() => void start()}>最新を確認する</PrimaryButton>
            </div>
          </div>
        );

      case "fetching_manifest":
        return (
          <p className="flex items-center gap-2 text-base-content/70">
            <Loader2 className="w-4 h-4 animate-spin" />
            最新版を確認しています…
          </p>
        );

      case "show_release": {
        const latest = state.manifest.version;
        const available = isUpdateAvailable(currentVersion === "不明" ? "" : currentVersion, latest);
        const upToDate = fw.supported && fw.version !== null && !available;
        return (
          <div>
            {upToDate ? (
              <p className="flex items-center gap-2 text-success mb-2">
                <CheckCircle2 className="w-5 h-5" />
                お使いのファームウェアは最新です
              </p>
            ) : (
              <p className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                {fw.supported ? "新しいバージョンがあります" : "最新版を書き込めます"}
              </p>
            )}
            <div className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 my-3">
              <span className="text-base-content/60">お使いのバージョン</span>
              <span>{currentVersion}</span>
              <span className="text-base-content/60">最新のバージョン</span>
              <span>{latest}</span>
            </div>
            {state.manifest.notes_ja && (
              <div className="text-sm my-3">
                <p className="text-base-content/60 mb-1">今回の変更</p>
                <p className="whitespace-pre-wrap">{state.manifest.notes_ja}</p>
              </div>
            )}
            <p className="text-sm text-base-content/50">所要時間 約5分 ／ USBケーブルが必要です</p>
            <div className="flex justify-end gap-3 mt-4">
              {upToDate ? (
                <PrimaryButton onPress={handleClose}>閉じる</PrimaryButton>
              ) : (
                <>
                  <GhostButton onPress={handleClose}>あとで</GhostButton>
                  <PrimaryButton onPress={() => dispatch({ type: "PROCEED" })}>更新する</PrimaryButton>
                </>
              )}
            </div>
          </div>
        );
      }

      case "downloading":
        return (
          <div>
            <p className="flex items-center gap-2 text-base-content/70 mb-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              最新のファームウェアを準備しています…
            </p>
            <div className="flex justify-end">
              <GhostButton onPress={cancel}>中止</GhostButton>
            </div>
          </div>
        );

      case "r_confirm":
      case "l_confirm": {
        const side = state.step === "r_confirm" ? "右" : "左";
        const confirm =
          state.step === "r_confirm"
            ? ({ type: "CONFIRM_R" } as const)
            : ({ type: "CONFIRM_L" } as const);
        return (
          <div>
            <p className="mb-3">
              更新する{side}半分だけを USB ケーブルでパソコンにつないでください。
            </p>
            <div className="flex justify-end">
              <PrimaryButton onPress={() => dispatch(confirm)}>
                {side}側の準備ができた
              </PrimaryButton>
            </div>
          </div>
        );
      }

      case "r_bootloader_guide":
      case "l_bootloader_guide": {
        const side = state.step === "r_bootloader_guide" ? "R" : "L";
        return (
          <div>
            <p className="mb-1">リセットボタンを「カチカチッ」と素早く2回押してください。</p>
            <GuideDiagram side={side} />
            <p className="flex items-center gap-2 text-sm text-base-content/70">
              <Loader2 className="w-4 h-4 animate-spin" />
              待機中… ボタンを押すと自動で次に進みます。
            </p>
            <div className="flex justify-end mt-4">
              <GhostButton onPress={cancel}>中止</GhostButton>
            </div>
          </div>
        );
      }

      case "r_flashing":
      case "l_flashing": {
        const side = state.step === "r_flashing" ? "右" : "左";
        return (
          <div>
            <p className="mb-2">{side}半分を更新しています…</p>
            <ProgressBar value={progressPct(progress)} />
            <p className="text-sm text-base-content/60 mt-1">{progressPct(progress)}%</p>
            <WriteWarning />
            <div className="flex justify-end">
              <GhostButton onPress={cancel} isDisabled>
                中止
              </GhostButton>
            </div>
          </div>
        );
      }

      case "swap_to_l":
        return (
          <div>
            <p className="flex items-center gap-2 text-success mb-2">
              <CheckCircle2 className="w-5 h-5" />
              右半分の更新が終わりました
            </p>
            <p className="mb-3">次は左半分です。USB ケーブルを左半分に差し替えてください。</p>
            <div className="flex justify-end">
              <PrimaryButton onPress={() => dispatch({ type: "SWAP_DONE" })}>
                差し替えました
              </PrimaryButton>
            </div>
          </div>
        );

      case "verify_checklist":
        return (
          <div>
            <p className="mb-2">動作を確認してください：</p>
            <ul className="list-disc pl-5 text-sm mb-4 space-y-1">
              <li>右手・左手の両方で入力できる</li>
              <li>トラックボールが動く</li>
            </ul>
            <div className="flex justify-end gap-3">
              <GhostButton onPress={() => dispatch({ type: "CHECKLIST_FAIL" })}>
                うまく動かない
              </GhostButton>
              <PrimaryButton onPress={() => dispatch({ type: "CHECKLIST_OK" })}>
                問題なく動く
              </PrimaryButton>
            </div>
          </div>
        );

      case "done":
        return (
          <div>
            <p className="flex items-center gap-2 text-success mb-2">
              <CheckCircle2 className="w-5 h-5" />
              更新が完了しました 🎉
            </p>
            {fw.version && <p className="text-sm text-base-content/60 mb-3">バージョン {fw.version}</p>}
            <div className="flex justify-end">
              <PrimaryButton onPress={handleClose}>完了</PrimaryButton>
            </div>
          </div>
        );

      case "blocked":
        return (
          <div>
            <p className="mb-3">{blockReasonText[state.reason]}</p>
            <div className="flex justify-end">
              <PrimaryButton onPress={handleClose}>閉じる</PrimaryButton>
            </div>
          </div>
        );

      case "error":
        return (
          <div>
            <p className="flex items-start gap-2 text-error mb-3">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              <span>{state.message}</span>
            </p>
            <div className="flex justify-end gap-3">
              <GhostButton onPress={() => dispatch({ type: "RESET" })}>最初に戻る</GhostButton>
              <PrimaryButton onPress={() => dispatch({ type: "ENTER_RECOVERY" })}>
                うまくいかないとき
              </PrimaryButton>
            </div>
          </div>
        );

      case "recovery":
      case "recovery_waiting":
      case "recovery_flashing":
      case "recovery_done":
        return (
          <RecoveryPanel
            state={state}
            progress={progress}
            actions={recovery}
            dispatch={dispatch}
            cancel={cancel}
            onClose={handleClose}
          />
        );
    }
  })();

  return (
    <GenericModal ref={ref} className="w-[min(560px,92vw)] max-h-[85vh] overflow-y-auto" onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{stepTitle[state.step]}</h2>
        {canClose && (
          <Button
            onPress={handleClose}
            aria-label="閉じる"
            className="p-1 rounded hover:bg-base-300"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      {body}
    </GenericModal>
  );
}
