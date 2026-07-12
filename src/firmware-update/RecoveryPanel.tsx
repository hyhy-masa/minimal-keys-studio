// Recovery panel — the three-mode safety net reached from any dead-end
// (S1.12b, design 09 §6.4). This is a NEW implementation, not a reskin of the
// flasher's "restart + support link" screen (Codex-review-10 Critical-3):
//   ① retry the current step   ② reflash one side   ③ export a support log
// plus an always-present "start over" (RESET) so there is never a dead-end.

import { useState, type ReactNode } from "react";
import { Button, Radio, RadioGroup } from "react-aria-components";
import { AlertTriangle, CheckCircle2, Download, Loader2, RotateCcw } from "lucide-react";
import type { WizardState, WizardEvent, Side } from "./machine";
import type { Progress } from "./useFirmwareUpdate";
import type { RecoveryActions } from "./useRecoveryActions";
import { ProgressBar } from "./ProgressBar";

type RecoveryState = Extract<
  WizardState,
  { step: "recovery" | "recovery_waiting" | "recovery_flashing" | "recovery_done" }
>;

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

export interface RecoveryPanelProps {
  state: RecoveryState;
  progress: Progress | null;
  actions: RecoveryActions;
  dispatch: (e: WizardEvent) => void;
  cancel: () => void;
  onClose: () => void;
}

export function RecoveryPanel({
  state,
  progress,
  actions,
  dispatch,
  cancel,
  onClose,
}: RecoveryPanelProps) {
  const [side, setSide] = useState<Side>("R");
  const [saved, setSaved] = useState<null | "ok" | "fail">(null);

  const handleExport = async () => {
    try {
      const ok = await actions.exportLog();
      // `false` = the user cancelled the save dialog; keep the panel quiet then.
      setSaved(ok ? "ok" : null);
    } catch {
      setSaved("fail");
    }
  };

  switch (state.step) {
    case "recovery":
      return (
        <div>
          {state.message && (
            <p className="mb-3 flex items-start gap-2 rounded bg-error/10 text-error p-2 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{state.message}</span>
            </p>
          )}
          <p className="text-sm text-base-content/70 mb-4">
            うまくいかないときは、下から対処を選んでください。焼き直しても壊れません。
          </p>

          {/* ① retry the step we came from (only when there is one) */}
          {state.from && (
            <div className="mb-4">
              <p className="font-medium mb-1">① いまの手順をもう一度試す</p>
              <PrimaryButton onPress={actions.retryCurrentStep}>もう一度試す</PrimaryButton>
            </div>
          )}

          {/* ② reflash just one half */}
          <div className="mb-4">
            <p className="font-medium mb-2">② 片方だけ書き直す</p>
            <RadioGroup
              aria-label="焼きたい側"
              value={side}
              onChange={(v) => setSide(v as Side)}
              className="flex gap-4 mb-2 text-sm"
            >
              <Radio value="R" className="flex items-center gap-1 cursor-pointer">
                <span className="inline-block w-3 h-3 rounded-full border border-base-content/40 selected:bg-primary selected:border-primary" />
                右（R）
              </Radio>
              <Radio value="L" className="flex items-center gap-1 cursor-pointer">
                <span className="inline-block w-3 h-3 rounded-full border border-base-content/40 selected:bg-primary selected:border-primary" />
                左（L）
              </Radio>
            </RadioGroup>
            <GhostButton onPress={() => void actions.flashOneSide(side)}>
              {side === "R" ? "右" : "左"}側を書き直す
            </GhostButton>
          </div>

          {/* ③ export a support log */}
          <div className="mb-4">
            <p className="font-medium mb-1">③ 解決しないとき</p>
            <div className="flex items-center gap-2">
              <GhostButton onPress={() => void handleExport()}>
                <span className="flex items-center gap-1">
                  <Download className="w-4 h-4" />
                  ログを保存
                </span>
              </GhostButton>
              <span className="text-sm text-base-content/60">→ 公式 LINE / Discord へ</span>
            </div>
            {saved === "ok" && (
              <p className="flex items-center gap-1 text-success text-sm mt-1">
                <CheckCircle2 className="w-4 h-4" />
                ログを保存しました
              </p>
            )}
            {saved === "fail" && (
              <p className="text-error text-sm mt-1">ログの保存に失敗しました。</p>
            )}
          </div>

          <hr className="border-base-300 my-3" />
          <Button
            onPress={() => dispatch({ type: "RESET" })}
            className="flex items-center gap-1 text-sm text-base-content/60 hover:text-base-content"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            最初からやり直す
          </Button>
        </div>
      );

    case "recovery_waiting":
      return (
        <div>
          <p className="mb-1">
            ① USB ケーブルがつながっているか確認 → ② {state.side === "R" ? "右" : "左"}側のリセットボタンを「カチカチッ」と素早く2回押してください。
          </p>
          <p className="flex items-center gap-2 text-sm text-base-content/70 my-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            書き込みモードを待っています…
          </p>
          <div className="flex justify-end">
            <GhostButton onPress={cancel}>中止</GhostButton>
          </div>
        </div>
      );

    case "recovery_flashing":
      return (
        <div>
          <p className="mb-2">{state.side === "R" ? "右" : "左"}側を書き直しています…</p>
          <ProgressBar value={progressPct(progress)} />
          <p className="text-sm text-base-content/60 mt-1">{progressPct(progress)}%</p>
          <div className="my-3 flex items-start gap-2 rounded bg-warning text-warning-content p-2 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>ケーブルを抜いたり、アプリを閉じたりしないでください。</span>
          </div>
          <div className="flex justify-end">
            <GhostButton onPress={cancel} isDisabled>
              中止
            </GhostButton>
          </div>
        </div>
      );

    case "recovery_done":
      return (
        <div>
          <p className="flex items-center gap-2 text-success mb-2">
            <CheckCircle2 className="w-5 h-5" />
            {state.side === "R" ? "右" : "左"}側の書き直しが完了しました
          </p>
          <p className="mb-3 text-sm">
            両手の入力とトラックボールを確認してください。まだうまく動かない場合は、もう一度対処を選べます。
          </p>
          <div className="flex justify-end gap-3">
            <GhostButton onPress={() => dispatch({ type: "ENTER_RECOVERY" })}>
              まだうまく動かない
            </GhostButton>
            <PrimaryButton onPress={onClose}>完了</PrimaryButton>
          </div>
        </div>
      );
  }
}
