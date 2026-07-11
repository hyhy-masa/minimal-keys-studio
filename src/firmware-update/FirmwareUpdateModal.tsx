import { useEffect, useRef, type ReactNode } from "react";
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
import fwResetRight from "../assets/fw-reset-right.webp";
import fwResetLeft from "../assets/fw-reset-left.webp";

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
 * Bootloader-guide illustration: a real product photo of the half being flashed,
 * with the reset button already marked (orange circle baked into the asset).
 * R = right half (Y/U/I/O/P row + trackball) / L = left half (W/E/R/T row + knob).
 * Assets A1/A2 + A3 overlay, design 09 §3.4. To update a photo, swap the imported
 * file — the R/L → file mapping below is the only wiring.
 */
function GuideDiagram({ side }: { side: "R" | "L" }) {
  const src = side === "R" ? fwResetRight : fwResetLeft;
  return (
    <figure className="my-3 rounded-lg border border-base-300 bg-base-200 p-2">
      <img
        src={src}
        alt={`${side === "R" ? "右" : "左"}半分のリセットボタンの位置（オレンジの丸で囲んだ穴）`}
        className="w-full h-auto rounded"
      />
      <figcaption className="text-sm text-base-content/70 text-center mt-2">
        オレンジの丸がリセットボタンです（{side === "R" ? "右" : "左"}半分）
      </figcaption>
    </figure>
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

/**
 * Asset A5 (design 09 §3.4): abstract "unplug from right → plug into left" diagram.
 * Simple line-art is fine here (this shows the action, not a physical location).
 * Inline SVG with base tokens so it adapts to Studio's light/dark themes.
 */
function CableSwapDiagram() {
  return (
    <div className="my-3 rounded-lg border border-base-300 bg-base-200 p-4">
      <svg viewBox="0 0 240 110" className="w-full h-auto max-w-[16rem] mx-auto" aria-hidden>
        {/* left half — the target (highlighted) */}
        <rect x="14" y="20" width="70" height="50" rx="8" className="fill-base-100 stroke-primary" strokeWidth="2.5" />
        {/* right half — the source */}
        <rect x="156" y="20" width="70" height="50" rx="8" className="fill-base-100 stroke-base-300" strokeWidth="2" />
        {/* cable being unplugged from the right (marked with ✗) */}
        <line x1="191" y1="70" x2="191" y2="90" className="stroke-base-content/40" strokeWidth="3" strokeLinecap="round" />
        <rect x="185" y="88" width="12" height="9" rx="1.5" className="fill-base-content/40" />
        <g className="stroke-danger" strokeWidth="2.5" strokeLinecap="round">
          <line x1="205" y1="79" x2="217" y2="91" />
          <line x1="217" y1="79" x2="205" y2="91" />
        </g>
        {/* arrow: move the cable from right to left */}
        <path d="M150 45 H96" className="fill-none stroke-base-content" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M104 38 L94 45 L104 52" className="fill-none stroke-base-content" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* cable being plugged into the left (highlighted) */}
        <line x1="49" y1="70" x2="49" y2="90" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
        <rect x="43" y="88" width="12" height="9" rx="1.5" className="fill-primary" />
      </svg>
      <div className="flex justify-between max-w-[16rem] mx-auto mt-2 text-sm text-base-content/70 px-1">
        <span>左に挿す</span>
        <span>右から抜く</span>
      </div>
    </div>
  );
}

/**
 * Asset A6 (design 09 §3.4, optional): restrained completion illustration.
 * Both halves + a few sparkles — deliberately not another big check (the screen
 * already shows a check icon and 🎉). Inline SVG, theme-adaptive.
 */
function DoneIllustration() {
  return (
    <div className="my-2 flex justify-center">
      <svg viewBox="0 0 200 80" className="w-44 h-auto" aria-hidden>
        <rect x="20" y="24" width="72" height="40" rx="8" className="fill-base-100 stroke-base-300" strokeWidth="2" />
        <rect x="108" y="24" width="72" height="40" rx="8" className="fill-base-100 stroke-base-300" strokeWidth="2" />
        <g className="fill-success">
          <path d="M100 6 l3.2 7.6 l7.6 3.2 l-7.6 3.2 l-3.2 7.6 l-3.2 -7.6 l-7.6 -3.2 l7.6 -3.2 z" />
          <circle cx="150" cy="14" r="2.5" />
          <circle cx="52" cy="16" r="2" />
        </g>
      </svg>
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

  // We drive Escape suppression ourselves (see the `cancel` listener below), so
  // we intentionally do NOT pass useModalRef's allowCancel/reopen path: that
  // reopen() fires the dialog's `close` event, which reaches GenericModal.onClose
  // and desyncs the parent's open flag. (F-5)
  const ref = useModalRef(open);

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

  // Native <dialog> lets Escape close the modal even when we hide the X and
  // disable the "中止" button. On any non-dismissable step (canClose=false:
  // downloading / *_confirm / *_bootloader_guide / *_flashing / swap_to_l /
  // verify_checklist / recovery_flashing) that would tear the wizard away
  // mid-flow — worst case during a write. Prevent the dialog's `cancel` event so
  // Escape is a no-op exactly when the on-screen close affordances are hidden. (F-5)
  const canCloseRef = useRef(canClose);
  canCloseRef.current = canClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      if (!canCloseRef.current) e.preventDefault();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [ref]);

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
            <CableSwapDiagram />
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
            <DoneIllustration />
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
    <GenericModal ref={ref} className="w-[min(560px,92vw)] max-h-[85vh] overflow-y-auto" onClose={handleClose}>
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
