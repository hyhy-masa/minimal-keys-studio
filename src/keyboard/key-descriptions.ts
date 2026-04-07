import { hid_usage_get_labels } from "../hid-usages";

export interface KeyDescription {
  roleName: string;
  description: string;
}

// Keyboard usage page (HID)
const KB = 7;

// Encoder is at position 0 (Q key position on left side)
export const ENCODER_POSITION = 0;

export interface EncoderOption {
  label: string;
  description: string;
}

export const ENCODER_ADJUSTABLE_OPTIONS: EncoderOption[] = [
  { label: "音量", description: "音量の上げ下げ" },
  { label: "スクロール", description: "ページの上下スクロール" },
  { label: "左右スクロール", description: "ページの左右スクロール" },
  { label: "Bluetooth切替", description: "接続先の切り替え" },
];

// Special HID key descriptions (Keyboard page = 7)
const specialKeys: Record<number, KeyDescription> = {
  40: { roleName: "Enter", description: "確定・改行" },
  41: { roleName: "Escape", description: "キャンセル・閉じる" },
  42: { roleName: "バックスペース", description: "1文字消す" },
  43: { roleName: "Tab", description: "タブ・次の項目へ" },
  44: { roleName: "スペース", description: "空白を入力" },
  57: { roleName: "Caps Lock", description: "大文字固定" },
  58: { roleName: "F1", description: "ヘルプを開く" },
  59: { roleName: "F2", description: "名前の変更" },
  60: { roleName: "F3", description: "検索" },
  61: { roleName: "F4", description: "アドレスバー" },
  62: { roleName: "F5", description: "更新・再読み込み" },
  63: { roleName: "F6", description: "アドレスバーに移動" },
  64: { roleName: "F7", description: "F7" },
  65: { roleName: "F8", description: "F8" },
  66: { roleName: "F9", description: "F9" },
  67: { roleName: "F10", description: "メニューバー" },
  68: { roleName: "F11", description: "全画面切替" },
  69: { roleName: "F12", description: "開発者ツール" },
  70: { roleName: "PrintScreen", description: "画面キャプチャ" },
  73: { roleName: "Insert", description: "挿入モード切替" },
  74: { roleName: "Home", description: "行の先頭へ" },
  75: { roleName: "Page Up", description: "1ページ上へ" },
  76: { roleName: "Delete", description: "カーソルの右を消す" },
  77: { roleName: "End", description: "行の末尾へ" },
  78: { roleName: "Page Down", description: "1ページ下へ" },
  79: { roleName: "→", description: "右に移動" },
  80: { roleName: "←", description: "左に移動" },
  81: { roleName: "↓", description: "下に移動" },
  82: { roleName: "↑", description: "上に移動" },
  224: { roleName: "左Ctrl", description: "修飾キー" },
  225: { roleName: "左Shift", description: "修飾キー" },
  226: { roleName: "左Alt", description: "修飾キー" },
  227: { roleName: "左⌘/Win", description: "修飾キー" },
  228: { roleName: "右Ctrl", description: "修飾キー" },
  229: { roleName: "右Shift", description: "修飾キー" },
  230: { roleName: "右Alt", description: "修飾キー" },
  231: { roleName: "右⌘/Win", description: "修飾キー" },
};

// Letter keys: A=4 to Z=29
function isLetterKey(id: number): boolean {
  return id >= 4 && id <= 29;
}

// Number keys: 1=30 to 0=39
function isNumberKey(id: number): boolean {
  return id >= 30 && id <= 39;
}

export function getHidKeyDescription(page: number, id: number): KeyDescription {
  if (page === KB) {
    // Known special keys
    if (specialKeys[id]) return specialKeys[id];

    // Letter keys
    if (isLetterKey(id)) {
      const labels = hid_usage_get_labels(page, id);
      const name =
        labels.short?.replace(/^Keyboard /, "") ||
        String.fromCharCode(65 + id - 4);
      return { roleName: name, description: "文字入力" };
    }

    // Number keys
    if (isNumberKey(id)) {
      const num = id === 39 ? "0" : String(id - 29);
      return { roleName: num, description: "数字入力" };
    }
  }

  // Generic fallback using HID labels
  const labels = hid_usage_get_labels(page, id);
  const name = labels.short?.replace(/^Keyboard /, "") || `Key ${id}`;
  return { roleName: name, description: "キー入力" };
}

// Mouse button descriptions — ZMK uses bitmask encoding
const mouseButtons: Record<number, KeyDescription> = {
  0x01: { roleName: "左クリック", description: "選択・決定" },
  0x02: { roleName: "右クリック", description: "メニューを開く" },
  0x04: { roleName: "中クリック", description: "新しいタブで開く" },
  0x08: { roleName: "戻る", description: "前のページへ戻る" },
  0x10: { roleName: "進む", description: "次のページへ進む" },
};

export function getMouseKeyDescription(buttonId: number): KeyDescription {
  return (
    mouseButtons[buttonId] ?? {
      roleName: `マウスボタン${buttonId}`,
      description: "マウス操作",
    }
  );
}

// Behavior displayName → Japanese role name (for non-Key-Press behaviors)
const behaviorRoleNames: Record<string, string> = {
  "Momentary Layer": "一時レイヤー",
  "Toggle Layer": "レイヤー切替",
  "Sticky Layer": "ワンショットレイヤー",
  "To Layer": "レイヤー移動",
  "Conditional Layer": "条件付きレイヤー",
  "Layer-Tap": "レイヤー/タップ",
  "Mod-Tap": "修飾キー/タップ",
  "Hold-Tap": "長押し/タップ",
  "Key Toggle": "キー固定",
  "Key Repeat": "キーリピート",
  "Sticky Key": "ワンショット修飾",
  "Caps Word": "Caps Word",
  "Grave/Escape": "Grave/Escape",
  Bluetooth: "Bluetooth操作",
  "Output Selection": "出力切替",
  "BLE Management": "BLE管理",
  Transparent: "透過",
  None: "無効",
  Bootloader: "ブートローダー",
  Reset: "リセット",
  "Soft Off": "電源OFF",
  "Mouse Key Press": "マウスキー",
  Macro: "マクロ",
};

export function getBehaviorRoleName(displayName: string): string {
  return behaviorRoleNames[displayName] ?? displayName;
}
