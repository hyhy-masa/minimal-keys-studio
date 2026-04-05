import { hid_usage_from_page_and_id } from "../hid-usages";

export interface UseCaseItem {
  label: string;
  description: string;
  behaviorDisplayName: string;
  param1: number;
  param2: number;
}

export interface UseCaseCategory {
  id: string;
  label: string;
  items: UseCaseItem[];
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
  F4: 61,
  F5: 62,
};

export const useCaseCategories: UseCaseCategory[] = [
  {
    id: "common-actions",
    label: "よく使う操作",
    items: [
      {
        label: "コピーする",
        description: "選択した部分を記憶する",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.C)),
        param2: 0,
      },
      {
        label: "貼り付ける",
        description: "記憶した内容をここに出す",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.V)),
        param2: 0,
      },
      {
        label: "切り取る",
        description: "選択した部分を記憶して消す",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.X)),
        param2: 0,
      },
      {
        label: "元に戻す",
        description: "直前の操作を取り消す",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.Z)),
        param2: 0,
      },
      {
        label: "やり直す",
        description: "取り消した操作をもう一度",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.Y)),
        param2: 0,
      },
      {
        label: "全部選択する",
        description: "すべてを選択状態にする",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.A)),
        param2: 0,
      },
      {
        label: "保存する",
        description: "今の状態を保存する",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.S)),
        param2: 0,
      },
      {
        label: "検索する",
        description: "文字を探す",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.F)),
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
        description: "開いているアプリを切り替える",
        behaviorDisplayName: "Key Press",
        param1: alt(key(HID.Tab)),
        param2: 0,
      },
      {
        label: "スクリーンショットを撮る",
        description: "画面を画像として保存する",
        behaviorDisplayName: "Key Press",
        param1: gui(key(HID.PrintScreen)),
        param2: 0,
      },
      {
        label: "デスクトップを表示する",
        description: "全ウィンドウを最小化する",
        behaviorDisplayName: "Key Press",
        param1: gui(key(HID.Delete)),
        param2: 0,
      },
      {
        label: "タブを閉じる",
        description: "ブラウザやエディタのタブを閉じる",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.W)),
        param2: 0,
      },
      {
        label: "新しいタブを開く",
        description: "ブラウザやエディタで新しいタブ",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.T)),
        param2: 0,
      },
      {
        label: "アドレスバーに移動",
        description: "ブラウザのURL欄にカーソルを移す",
        behaviorDisplayName: "Key Press",
        param1: ctrl(key(HID.L)),
        param2: 0,
      },
    ],
  },
  {
    id: "layers",
    label: "レイヤーを使う",
    items: [
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
