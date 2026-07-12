import type { WizardState, BlockReason } from "./machine";

/** Japanese, non-technical title for each wizard step. */
export const stepTitle: Record<WizardState["step"], string> = {
  idle: "ファームウェア更新",
  fetching_manifest: "最新版を確認しています…",
  show_release: "更新の準備ができました",
  downloading: "ファームウェアをダウンロード中…",
  r_confirm: "右側（R）を更新します",
  r_bootloader_guide: "右側を書き込みモードにしてください",
  r_flash_confirm: "右側に書き込む準備ができました",
  r_flashing: "右側に書き込み中…",
  swap_to_l: "ケーブルを左側（L）に差し替えてください",
  l_confirm: "左側（L）を更新します",
  l_bootloader_guide: "左側を書き込みモードにしてください",
  l_flash_confirm: "左側に書き込む準備ができました",
  l_flashing: "左側に書き込み中…",
  verify_checklist: "動作を確認してください",
  done: "更新が完了しました",
  blocked: "この更新はアプリからは行えません",
  error: "エラーが発生しました",
  recovery: "うまくいかないとき",
  recovery_waiting: "書き込みモードを待っています…",
  recovery_flashing: "片側を書き直しています…",
  recovery_done: "書き直しが完了しました",
};

export const errorRecoveryButtonLabel = "対処方法を見る";

export const blockReasonText: Record<BlockReason, string> = {
  settings_reset_unsupported:
    "この更新はキーボードの設定初期化を伴うため、まだアプリからは実行できません。公式LINE / Discord の案内に従ってください。",
  tool_too_old:
    "このアップデーターは古いため、この更新には対応していません。最新のアプリに更新してください（LINE / Discord に案内があります）。",
};

/**
 * Turn a Tauri-rejected `FlashError` (a tagged JSON object) into a
 * non-technical Japanese sentence with the customer's next action. Falls back
 * gracefully for plain strings / unknown shapes (fixes the "[object Object]" bug).
 */
export function formatError(e: unknown): string {
  const kind =
    e && typeof e === "object" && "kind" in e ? String((e as { kind: unknown }).kind) : null;
  switch (kind) {
    case "NoBootloaderVolume":
      return "キーボードが「書き込みモード」で見つかりませんでした。リセットボタンを素早く2回押して、もう一度お試しください。";
    case "MultipleBootloaderVolumes":
      return "書き込みモードのデバイスが複数見つかりました。左右のうち、今作業する片方だけをUSB接続してください。";
    case "NotUf2Volume":
      return "接続されたデバイスは minimal-keys ではないようです。他のUSB機器を外して、キーボードだけを接続してください。";
    case "InvalidUf2":
    case "ChecksumMismatch":
      return "ダウンロードしたファームウェアが壊れていました。もう一度お試しください（直らない場合はサポートへ）。";
    case "PrematureReboot":
    case "WriteFailed":
    case "UnmountTimeout":
      return "書き込みが最後まで完了しませんでした。ケーブルを挿し直し、もう一度お試しください。";
    case "PermissionDenied":
      return "書き込みモードのキーボードにアクセスできませんでした。システム設定のプライバシーで許可が必要な場合があります。";
    case "DownloadFailed":
      return "ダウンロードに失敗しました。インターネット接続を確認して、もう一度お試しください。";
    case "ManifestInvalid":
      return "更新情報を正しく読み取れませんでした。アプリが古い可能性があります。最新のアプリをご確認ください（LINE / Discord に案内があります）。";
    case "Io":
      return "パソコン側のファイル操作に失敗しました。アプリを再起動してもう一度お試しください（直らない場合はサポートへ）。";
    case "ConnectionLost":
      return "キーボードとの接続が切れたようです。ケーブルを挿し直して、もう一度お試しください。";
    case "Cancelled":
      return "操作をキャンセルしました。";
    default:
      if (typeof e === "string") return e;
      return "予期しないエラーが発生しました。もう一度お試しください。";
  }
}
