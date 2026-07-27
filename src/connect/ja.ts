import type { AutoConnectFailureReason } from "./autoConnectUsb";

export const usbAutoConnectSearchingText = "キーボードを探しています…";

const autoConnectFailureText: Record<AutoConnectFailureReason, string> = {
  "no-candidates":
    "USBケーブルが挿さっているか確認してください。充電専用ケーブルではキーボードを認識できません。",
  "no-response":
    "右手側（トラックボールのある方）をつないでください。左手側では設定できません。",
};

export function getAutoConnectFailureText(reason: AutoConnectFailureReason): string {
  return autoConnectFailureText[reason];
}
