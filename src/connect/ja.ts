import type { AutoConnectFailureReason } from "./autoConnectUsb";

export const usbAutoConnectSearchingText = "キーボードを探しています…";

const autoConnectFailureText: Record<AutoConnectFailureReason, string> = {
  "no-candidates":
    "USBケーブルが挿さっているか確認してください。充電専用ケーブルではキーボードを認識できません。",
  "no-response":
    "キーボードから応答がありません。次の2つを確かめてください。\n" +
    "① 右手側（トラックボールのある方）をつないでいるか。左手側では設定できません。\n" +
    "② 出力先が「BLE」になっていないか。出力先が「BLE」のままだと、USBではつながりません。「ワイヤレスでつなぐ」で接続し、「Bluetooth」タブの出力先を「USB」に切り替えてから、もう一度お試しください。",
};

export function getAutoConnectFailureText(reason: AutoConnectFailureReason): string {
  return autoConnectFailureText[reason];
}
