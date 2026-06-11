import { hid_usage_from_page_and_id } from "../../hid-usages";
import type { UserOS } from "../use-cases";

// HID Usage Page IDs (USB HID spec §3 "Usage Pages")
// See: https://usb.org/document-library/hid-usage-tables-15
const KB = 7; // Keyboard/Keypad page — standard keys (A-Z, 0-9, arrows, etc.)
const CONSUMER = 12; // Consumer Control page — media, brightness, app launch, etc.

export const key = (id: number) => hid_usage_from_page_and_id(KB, id);
const consumer = (id: number) => hid_usage_from_page_and_id(CONSUMER, id);

// ZMK param1 bit layout: [31:24] = modifier flags, [23:0] = HID usage
// Modifier bitmask values follow ZMK's implicit modifier encoding:
//   0x01 = Ctrl, 0x02 = Shift, 0x04 = Alt, 0x08 = GUI (Cmd/Win)
// Combined modifiers OR the individual flags (e.g. Ctrl+Shift = 0x01|0x02 = 0x03)
const ctrl = (usage: number) => (0x01 << 24) | usage;
const shift = (usage: number) => (0x02 << 24) | usage;
const alt = (usage: number) => (0x04 << 24) | usage;
const gui = (usage: number) => (0x08 << 24) | usage;
const ctrlShift = (usage: number) => (0x03 << 24) | usage;
const guiShift = (usage: number) => (0x0a << 24) | usage;
const guiAlt = (usage: number) => (0x0c << 24) | usage;
const ctrlGui = (usage: number) => (0x09 << 24) | usage;
const altShift = (usage: number) => (0x06 << 24) | usage;

function shortcut(os: string, usage: number): number {
  return os === "mac" ? gui(usage) : ctrl(usage);
}

export interface ActionItem {
  label: string;
  description: string;
  behaviorName: string;
  param1: number;
}

// --- Editing ---

export function getEditingItems(os: UserOS): ActionItem[] {
  const mod = os === "mac" ? "⌘" : "Ctrl";
  return [
    { label: "コピー", description: `${mod}+C`, behaviorName: "Key Press", param1: shortcut(os, key(6)) },
    { label: "貼り付け", description: `${mod}+V`, behaviorName: "Key Press", param1: shortcut(os, key(25)) },
    { label: "切り取り", description: `${mod}+X`, behaviorName: "Key Press", param1: shortcut(os, key(27)) },
    { label: "元に戻す", description: `${mod}+Z`, behaviorName: "Key Press", param1: shortcut(os, key(29)) },
    {
      label: "やり直す",
      description: os === "mac" ? "⌘+Shift+Z" : "Ctrl+Y",
      behaviorName: "Key Press",
      param1: os === "mac" ? guiShift(key(29)) : ctrl(key(28)),
    },
    { label: "保存", description: `${mod}+S`, behaviorName: "Key Press", param1: shortcut(os, key(22)) },
    { label: "全選択", description: `${mod}+A`, behaviorName: "Key Press", param1: shortcut(os, key(4)) },
    { label: "検索", description: `${mod}+F`, behaviorName: "Key Press", param1: shortcut(os, key(9)) },
    {
      label: "置換",
      description: os === "mac" ? "⌘+Option+F" : "Ctrl+H",
      behaviorName: "Key Press",
      param1: os === "mac" ? guiAlt(key(9)) : ctrl(key(11)),
    },
    { label: "印刷", description: `${mod}+P`, behaviorName: "Key Press", param1: shortcut(os, key(19)) },
    { label: "閉じる", description: `${mod}+W`, behaviorName: "Key Press", param1: shortcut(os, key(26)) },
    {
      label: "行を削除",
      description: os === "mac" ? "⌘+Shift+K" : "Ctrl+Shift+K",
      behaviorName: "Key Press",
      param1: os === "mac" ? guiShift(key(14)) : ctrlShift(key(14)),
    },
  ];
}

// --- Window ---

export function getWindowItems(os: UserOS): ActionItem[] {
  if (os === "mac") {
    return [
      { label: "アプリ切替", description: "⌘+Tab", behaviorName: "Key Press", param1: gui(key(43)) },
      { label: "前のアプリ", description: "⌘+Shift+Tab", behaviorName: "Key Press", param1: guiShift(key(43)) },
      { label: "ウィンドウを閉じる", description: "⌘+W", behaviorName: "Key Press", param1: gui(key(26)) },
      { label: "最小化", description: "⌘+M", behaviorName: "Key Press", param1: gui(key(16)) },
      { label: "全画面", description: "Ctrl+⌘+F", behaviorName: "Key Press", param1: ctrlGui(key(9)) },
      { label: "Mission Control", description: "Ctrl+↑", behaviorName: "Key Press", param1: ctrl(key(82)) },
      { label: "Spotlight", description: "⌘+Space", behaviorName: "Key Press", param1: gui(key(44)) },
      { label: "強制終了", description: "⌘+Option+Esc", behaviorName: "Key Press", param1: guiAlt(key(41)) },
    ];
  }
  return [
    { label: "アプリ切替", description: "Alt+Tab", behaviorName: "Key Press", param1: alt(key(43)) },
    { label: "前のアプリ", description: "Alt+Shift+Tab", behaviorName: "Key Press", param1: altShift(key(43)) },
    { label: "ウィンドウを閉じる", description: "Alt+F4", behaviorName: "Key Press", param1: alt(key(61)) },
    { label: "最小化", description: "Win+↓", behaviorName: "Key Press", param1: gui(key(81)) },
    { label: "全画面", description: "F11", behaviorName: "Key Press", param1: key(68) },
    { label: "タスクビュー", description: "Win+Tab", behaviorName: "Key Press", param1: gui(key(43)) },
    { label: "デスクトップ表示", description: "Win+D", behaviorName: "Key Press", param1: gui(key(7)) },
    { label: "検索", description: "Win+S", behaviorName: "Key Press", param1: gui(key(22)) },
    { label: "左に配置", description: "Win+←", behaviorName: "Key Press", param1: gui(key(80)) },
    { label: "右に配置", description: "Win+→", behaviorName: "Key Press", param1: gui(key(79)) },
    { label: "強制終了", description: "Ctrl+Shift+Esc", behaviorName: "Key Press", param1: ctrlShift(key(41)) },
  ];
}

// --- Browser ---

export function getBrowserItems(os: UserOS): ActionItem[] {
  const mod = os === "mac" ? "⌘" : "Ctrl";
  return [
    { label: "新規タブ", description: `${mod}+T`, behaviorName: "Key Press", param1: shortcut(os, key(23)) },
    { label: "タブを閉じる", description: `${mod}+W`, behaviorName: "Key Press", param1: shortcut(os, key(26)) },
    { label: "次のタブ", description: "Ctrl+Tab", behaviorName: "Key Press", param1: ctrl(key(43)) },
    { label: "前のタブ", description: "Ctrl+Shift+Tab", behaviorName: "Key Press", param1: ctrlShift(key(43)) },
    {
      label: "タブを復元",
      description: os === "mac" ? "⌘+Shift+T" : "Ctrl+Shift+T",
      behaviorName: "Key Press",
      param1: os === "mac" ? guiShift(key(23)) : ctrlShift(key(23)),
    },
    { label: "更新", description: `${mod}+R`, behaviorName: "Key Press", param1: shortcut(os, key(21)) },
    { label: "アドレスバー", description: `${mod}+L`, behaviorName: "Key Press", param1: shortcut(os, key(15)) },
    {
      label: "戻る",
      description: os === "mac" ? "⌘+[" : "Alt+←",
      behaviorName: "Key Press",
      param1: os === "mac" ? gui(key(47)) : alt(key(80)),
    },
    {
      label: "進む",
      description: os === "mac" ? "⌘+]" : "Alt+→",
      behaviorName: "Key Press",
      param1: os === "mac" ? gui(key(48)) : alt(key(79)),
    },
    { label: "ブックマーク", description: `${mod}+D`, behaviorName: "Key Press", param1: shortcut(os, key(7)) },
    {
      label: "DevTools",
      description: os === "mac" ? "⌘+Option+I" : "F12",
      behaviorName: "Key Press",
      param1: os === "mac" ? guiAlt(key(12)) : key(69),
    },
  ];
}

// --- System shortcuts ---

export function getSystemShortcutItems(os: UserOS): ActionItem[] {
  if (os === "mac") {
    return [
      { label: "スクリーンショット(全画面)", description: "⌘+Shift+3", behaviorName: "Key Press", param1: guiShift(key(32)) },
      { label: "スクリーンショット(選択)", description: "⌘+Shift+4", behaviorName: "Key Press", param1: guiShift(key(33)) },
      { label: "画面ロック", description: "Ctrl+⌘+Q", behaviorName: "Key Press", param1: ctrlGui(key(20)) },
      { label: "強制終了", description: "⌘+Option+Esc", behaviorName: "Key Press", param1: guiAlt(key(41)) },
      { label: "Spotlight", description: "⌘+Space", behaviorName: "Key Press", param1: gui(key(44)) },
    ];
  }
  return [
    { label: "スクリーンショット(全画面)", description: "PrintScreen", behaviorName: "Key Press", param1: key(70) },
    { label: "スクリーンショット(選択)", description: "Win+Shift+S", behaviorName: "Key Press", param1: guiShift(key(22)) },
    { label: "画面ロック", description: "Win+L", behaviorName: "Key Press", param1: gui(key(15)) },
    { label: "強制終了", description: "Ctrl+Shift+Esc", behaviorName: "Key Press", param1: ctrlShift(key(41)) },
    { label: "セキュリティ画面", description: "Ctrl+Alt+Del", behaviorName: "Key Press", param1: (0x05 << 24) | key(76) },
  ];
}

// --- Text navigation ---

export function getTextNavItems(os: UserOS): ActionItem[] {
  if (os === "mac") {
    return [
      { label: "次の単語", description: "Option+→", behaviorName: "Key Press", param1: alt(key(79)) },
      { label: "前の単語", description: "Option+←", behaviorName: "Key Press", param1: alt(key(80)) },
      { label: "行頭", description: "⌘+←", behaviorName: "Key Press", param1: gui(key(80)) },
      { label: "行末", description: "⌘+→", behaviorName: "Key Press", param1: gui(key(79)) },
      { label: "文書先頭", description: "⌘+↑", behaviorName: "Key Press", param1: gui(key(82)) },
      { label: "文書末尾", description: "⌘+↓", behaviorName: "Key Press", param1: gui(key(81)) },
      { label: "単語選択(右)", description: "Option+Shift+→", behaviorName: "Key Press", param1: altShift(key(79)) },
      { label: "単語選択(左)", description: "Option+Shift+←", behaviorName: "Key Press", param1: altShift(key(80)) },
      { label: "行末まで選択", description: "⌘+Shift+→", behaviorName: "Key Press", param1: guiShift(key(79)) },
      { label: "行頭まで選択", description: "⌘+Shift+←", behaviorName: "Key Press", param1: guiShift(key(80)) },
    ];
  }
  return [
    { label: "次の単語", description: "Ctrl+→", behaviorName: "Key Press", param1: ctrl(key(79)) },
    { label: "前の単語", description: "Ctrl+←", behaviorName: "Key Press", param1: ctrl(key(80)) },
    { label: "行頭", description: "Home", behaviorName: "Key Press", param1: key(74) },
    { label: "行末", description: "End", behaviorName: "Key Press", param1: key(77) },
    { label: "文書先頭", description: "Ctrl+Home", behaviorName: "Key Press", param1: ctrl(key(74)) },
    { label: "文書末尾", description: "Ctrl+End", behaviorName: "Key Press", param1: ctrl(key(77)) },
    { label: "単語選択(右)", description: "Ctrl+Shift+→", behaviorName: "Key Press", param1: ctrlShift(key(79)) },
    { label: "単語選択(左)", description: "Ctrl+Shift+←", behaviorName: "Key Press", param1: ctrlShift(key(80)) },
    { label: "行末まで選択", description: "Shift+End", behaviorName: "Key Press", param1: shift(key(77)) },
    { label: "行頭まで選択", description: "Shift+Home", behaviorName: "Key Press", param1: shift(key(74)) },
  ];
}

// --- Scroll ---

export const scrollItems: ActionItem[] = [
  { label: "スクロール上", description: "画面を上にスクロール", behaviorName: "Key Press", param1: consumer(0x233) },
  { label: "スクロール下", description: "画面を下にスクロール", behaviorName: "Key Press", param1: consumer(0x234) },
  { label: "横スクロール左", description: "画面を左にスクロール", behaviorName: "Key Press", param1: consumer(0x236) },
  { label: "横スクロール右", description: "画面を右にスクロール", behaviorName: "Key Press", param1: consumer(0x237) },
];

// --- Mouse (existing) ---

export const mouseItems: ActionItem[] = [
  { label: "左クリック", description: "選択・決定", behaviorName: "Mouse Key Press", param1: 0x01 },
  { label: "右クリック", description: "メニューを開く", behaviorName: "Mouse Key Press", param1: 0x02 },
  { label: "中クリック", description: "新しいタブで開く", behaviorName: "Mouse Key Press", param1: 0x04 },
  { label: "戻る", description: "前のページへ戻る", behaviorName: "Mouse Key Press", param1: 0x08 },
  { label: "進む", description: "次のページへ進む", behaviorName: "Mouse Key Press", param1: 0x10 },
];

// --- Media (existing) ---

export const mediaItems: ActionItem[] = [
  { label: "再生/一時停止", description: "メディア再生制御", behaviorName: "Key Press", param1: consumer(0xcd) },
  { label: "音量を上げる", description: "Volume Up", behaviorName: "Key Press", param1: consumer(0xe9) },
  { label: "音量を下げる", description: "Volume Down", behaviorName: "Key Press", param1: consumer(0xea) },
  { label: "ミュート", description: "消音", behaviorName: "Key Press", param1: consumer(0xe2) },
  { label: "次の曲", description: "Next Track", behaviorName: "Key Press", param1: consumer(0xb5) },
  { label: "前の曲", description: "Previous Track", behaviorName: "Key Press", param1: consumer(0xb6) },
  { label: "画面を明るく", description: "Brightness Up", behaviorName: "Key Press", param1: consumer(0x6f) },
  { label: "画面を暗く", description: "Brightness Down", behaviorName: "Key Press", param1: consumer(0x70) },
  { label: "停止", description: "メディア停止", behaviorName: "Key Press", param1: consumer(0xb7) },
  { label: "イジェクト", description: "ディスク取り出し", behaviorName: "Key Press", param1: consumer(0xb8) },
];

// --- App Launch (existing) ---

export const appLaunchItems: ActionItem[] = [
  { label: "電卓", description: "電卓アプリを起動", behaviorName: "Key Press", param1: consumer(0x192) },
  { label: "メール", description: "メールアプリを起動", behaviorName: "Key Press", param1: consumer(0x18a) },
  { label: "ブラウザ", description: "Webブラウザを起動", behaviorName: "Key Press", param1: consumer(0x196) },
  { label: "ファイル", description: "ファイルマネージャを起動", behaviorName: "Key Press", param1: consumer(0x194) },
  { label: "スリープ", description: "スリープモードへ", behaviorName: "Key Press", param1: consumer(0x32) },
  { label: "ロック", description: "画面をロック", behaviorName: "Key Press", param1: consumer(0x19e) },
];

// --- Navigation (existing) ---

export const navItems: ActionItem[] = [
  { label: "↑", description: "上に移動", behaviorName: "Key Press", param1: key(82) },
  { label: "↓", description: "下に移動", behaviorName: "Key Press", param1: key(81) },
  { label: "←", description: "左に移動", behaviorName: "Key Press", param1: key(80) },
  { label: "→", description: "右に移動", behaviorName: "Key Press", param1: key(79) },
  { label: "Home", description: "行の先頭へ", behaviorName: "Key Press", param1: key(74) },
  { label: "End", description: "行の末尾へ", behaviorName: "Key Press", param1: key(77) },
  { label: "Page Up", description: "1ページ上へ", behaviorName: "Key Press", param1: key(75) },
  { label: "Page Down", description: "1ページ下へ", behaviorName: "Key Press", param1: key(78) },
  { label: "PrintScreen", description: "画面キャプチャ", behaviorName: "Key Press", param1: key(70) },
];
