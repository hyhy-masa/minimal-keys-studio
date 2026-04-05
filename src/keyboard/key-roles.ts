import { hid_usage_from_page_and_id } from "../hid-usages";

export interface KeyRecommendation {
  label: string;
  description: string;
  behaviorDisplayName: string;
  param1: number;
  param2: number;
  popular?: boolean;
}

export interface KeyRole {
  roleLabel: string;
  recommendations: KeyRecommendation[];
}

export type KeyRoleMap = Record<number, KeyRole>;

const KB = 7;
const key = (id: number) => hid_usage_from_page_and_id(KB, id);

const HID = {
  Enter: 40,
  Space: 44,
  Backspace: 42,
  Escape: 41,
  Tab: 43,
  Delete: 76,
};

// Thumb key position indices (from minimal-keys.dtsi physical layout)
// Row 3: pos 34-39 (left), 40-41 (right), 42 (right pinky)
// Thumb keys: 37-39 (left inner), 40-41 (right inner)
export const keyRoleMap: KeyRoleMap = {
  37: {
    roleLabel: "左手親指・外側",
    recommendations: [
      {
        label: "Tab",
        description: "タブキー",
        behaviorDisplayName: "Key Press",
        param1: key(HID.Tab),
        param2: 0,
      },
      {
        label: "一時レイヤー",
        description: "押している間だけレイヤー切替",
        behaviorDisplayName: "Momentary Layer",
        param1: 1,
        param2: 0,
      },
    ],
  },
  38: {
    roleLabel: "左手親指・中央",
    recommendations: [
      {
        label: "スペース",
        description: "スペースキー",
        behaviorDisplayName: "Key Press",
        param1: key(HID.Space),
        param2: 0,
        popular: true,
      },
      {
        label: "Enter",
        description: "確定・改行",
        behaviorDisplayName: "Key Press",
        param1: key(HID.Enter),
        param2: 0,
      },
    ],
  },
  39: {
    roleLabel: "左手親指・内側",
    recommendations: [
      {
        label: "バックスペース",
        description: "1文字消す",
        behaviorDisplayName: "Key Press",
        param1: key(HID.Backspace),
        param2: 0,
        popular: true,
      },
      {
        label: "Delete",
        description: "カーソルの右側を消す",
        behaviorDisplayName: "Key Press",
        param1: key(HID.Delete),
        param2: 0,
      },
      {
        label: "Escape",
        description: "キャンセル・閉じる",
        behaviorDisplayName: "Key Press",
        param1: key(HID.Escape),
        param2: 0,
      },
    ],
  },
  40: {
    roleLabel: "右手親指・内側",
    recommendations: [
      {
        label: "バックスペース",
        description: "1文字消す",
        behaviorDisplayName: "Key Press",
        param1: key(HID.Backspace),
        param2: 0,
      },
      {
        label: "Escape",
        description: "キャンセル・閉じる",
        behaviorDisplayName: "Key Press",
        param1: key(HID.Escape),
        param2: 0,
      },
    ],
  },
  41: {
    roleLabel: "右手親指・外側",
    recommendations: [
      {
        label: "Enter",
        description: "確定・改行",
        behaviorDisplayName: "Key Press",
        param1: key(HID.Enter),
        param2: 0,
        popular: true,
      },
      {
        label: "一時レイヤー",
        description: "押している間だけレイヤー切替",
        behaviorDisplayName: "Momentary Layer",
        param1: 1,
        param2: 0,
      },
      {
        label: "スペース",
        description: "スペースキー",
        behaviorDisplayName: "Key Press",
        param1: key(HID.Space),
        param2: 0,
      },
    ],
  },
};
