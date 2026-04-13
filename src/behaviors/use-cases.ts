import { hid_usage_from_page_and_id } from "../hid-usages";

export interface UseCaseItem {
  label: string;
  description: string;
  behaviorDisplayName: string;
  param1: number;
  param2: number;
  needsParams?: boolean;
}

export interface UseCaseCategory {
  id: string;
  label: string;
  items: UseCaseItem[];
}

export type UserOS = "mac" | "windows";

// Auto-detect OS from browser/Tauri environment
export function detectOS(): UserOS {
  return navigator.platform?.toLowerCase().includes("mac") ? "mac" : "windows";
}

// HID helpers
const KB = 7; // Keyboard usage page
const key = (id: number) => hid_usage_from_page_and_id(KB, id);
const ctrl = (usage: number) => (0x01 << 24) | usage;
const alt = (usage: number) => (0x04 << 24) | usage;
const gui = (usage: number) => (0x08 << 24) | usage;

// Common HID key IDs (keyboard page)
const HID = {
  C: 6,
  V: 25,
  X: 27,
  Z: 29,
  Y: 28,
  A: 4,
  S: 22,
  F: 9,
  N: 17,
  W: 26,
  T: 23,
  L: 15,
  P: 19,
  Tab: 43,
  Enter: 40,
  Space: 44,
  Escape: 41,
  Delete: 76,
  Backspace: 42,
  PrintScreen: 70,
  F3: 60,
  F4: 61,
  F5: 62,
};

// OS-specific shortcut modifier: Cmd on Mac, Ctrl on Windows
function shortcut(os: UserOS, usage: number): number {
  return os === "mac" ? gui(usage) : ctrl(usage);
}

export function getUseCaseCategories(os: UserOS): UseCaseCategory[] {
  const modLabel = os === "mac" ? "Cmd" : "Ctrl";

  return [
    {
      id: "common-actions",
      label: "よく使う操作",
      items: [
        {
          label: "コピーする",
          description: `選択した部分を記憶する (${modLabel}+C)`,
          behaviorDisplayName: "Key Press",
          param1: shortcut(os, key(HID.C)),
          param2: 0,
        },
        {
          label: "貼り付ける",
          description: `記憶した内容をここに出す (${modLabel}+V)`,
          behaviorDisplayName: "Key Press",
          param1: shortcut(os, key(HID.V)),
          param2: 0,
        },
        {
          label: "切り取る",
          description: `選択した部分を記憶して消す (${modLabel}+X)`,
          behaviorDisplayName: "Key Press",
          param1: shortcut(os, key(HID.X)),
          param2: 0,
        },
        {
          label: "元に戻す",
          description: `直前の操作を取り消す (${modLabel}+Z)`,
          behaviorDisplayName: "Key Press",
          param1: shortcut(os, key(HID.Z)),
          param2: 0,
        },
        {
          label: "やり直す",
          description: os === "mac"
            ? "取り消した操作をもう一度 (Cmd+Shift+Z)"
            : "取り消した操作をもう一度 (Ctrl+Y)",
          behaviorDisplayName: "Key Press",
          param1: os === "mac"
            ? (0x0A << 24) | key(HID.Z) // Cmd+Shift
            : ctrl(key(HID.Y)),
          param2: 0,
        },
        {
          label: "全部選択する",
          description: `すべてを選択状態にする (${modLabel}+A)`,
          behaviorDisplayName: "Key Press",
          param1: shortcut(os, key(HID.A)),
          param2: 0,
        },
        {
          label: "保存する",
          description: `今の状態を保存する (${modLabel}+S)`,
          behaviorDisplayName: "Key Press",
          param1: shortcut(os, key(HID.S)),
          param2: 0,
        },
        {
          label: "検索する",
          description: `文字を探す (${modLabel}+F)`,
          behaviorDisplayName: "Key Press",
          param1: shortcut(os, key(HID.F)),
          param2: 0,
        },
      ],
    },
    {
      id: "productivity",
      label: "仕事効率化",
      items: [
        {
          label: "ウィンドウを切り替える",
          description: os === "mac"
            ? "開いているアプリを切り替える (Cmd+Tab)"
            : "開いているアプリを切り替える (Alt+Tab)",
          behaviorDisplayName: "Key Press",
          param1: os === "mac" ? gui(key(HID.Tab)) : alt(key(HID.Tab)),
          param2: 0,
        },
        {
          label: "スクリーンショットを撮る",
          description: os === "mac"
            ? "画面を画像として保存する (Cmd+Shift+3)"
            : "画面を画像として保存する (Win+PrintScreen)",
          behaviorDisplayName: "Key Press",
          param1: os === "mac"
            ? (0x0A << 24) | key(HID.F3) // Cmd+Shift+3 (approximate)
            : gui(key(HID.PrintScreen)),
          param2: 0,
        },
        {
          label: "タブを閉じる",
          description: `ブラウザやエディタのタブを閉じる (${modLabel}+W)`,
          behaviorDisplayName: "Key Press",
          param1: shortcut(os, key(HID.W)),
          param2: 0,
        },
        {
          label: "新しいタブを開く",
          description: `ブラウザやエディタで新しいタブ (${modLabel}+T)`,
          behaviorDisplayName: "Key Press",
          param1: shortcut(os, key(HID.T)),
          param2: 0,
        },
        {
          label: "アドレスバーに移動",
          description: `ブラウザのURL欄にカーソルを移す (${modLabel}+L)`,
          behaviorDisplayName: "Key Press",
          param1: shortcut(os, key(HID.L)),
          param2: 0,
        },
      ],
    },
    {
      id: "layers",
      label: "レイヤーを使う",
      items: [
        {
          label: "普段はキー入力、長押しでレイヤー切替",
          description:
            "1つのキーに2つの役割。短く押すと通常キー、長押しでレイヤーを切り替える。キーが少ないキーボードの必須テクニック",
          behaviorDisplayName: "Layer-Tap",
          param1: 0,
          param2: 0,
          needsParams: true,
        },
        {
          label: "普段はキー入力、長押しで修飾キー",
          description:
            "短く押すと通常キー、長押しでCtrlやShiftとして動作する。ホームポジションから手を動かさずに修飾キーが使える",
          behaviorDisplayName: "Mod-Tap",
          param1: 0,
          param2: 0,
          needsParams: true,
        },
        {
          label: "押している間だけ切り替える",
          description:
            "キーを押している間だけ別のレイヤーになる。離すと戻る",
          behaviorDisplayName: "Momentary Layer",
          param1: 1,
          param2: 0,
        },
        {
          label: "ON/OFFで切り替える",
          description: "1回押すとON、もう1回押すとOFF",
          behaviorDisplayName: "Toggle Layer",
          param1: 1,
          param2: 0,
        },
        {
          label: "次の1キーだけ切り替える",
          description: "次に押す1キーだけ別レイヤーで入力する",
          behaviorDisplayName: "Sticky Layer",
          param1: 1,
          param2: 0,
        },
      ],
    },
  ];
}

