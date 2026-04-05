// Behavior descriptions and category mapping for the behavior picker UI.
// displayName values come from firmware via RPC (GetBehaviorDetailsResponse).

export interface BehaviorDescription {
  label: string;
  description: string;
  category: BehaviorCategory;
}

export type BehaviorCategory =
  | "basic"
  | "layer"
  | "bluetooth"
  | "system"
  | "other";

export const categoryLabels: Record<BehaviorCategory, string> = {
  basic: "基本キー操作",
  layer: "レイヤー",
  bluetooth: "Bluetooth・接続",
  system: "システム",
  other: "その他",
};

export const categoryOrder: BehaviorCategory[] = [
  "basic",
  "layer",
  "bluetooth",
  "system",
  "other",
];

// Map from firmware displayName to UI metadata.
// Unknown behaviors fall back to "other" category with no description.
const descriptions: Record<string, BehaviorDescription> = {
  "Key Press": {
    label: "キー入力",
    description: "通常のキー入力。押している間だけキーコードを送信する",
    category: "basic",
  },
  "Key Toggle": {
    label: "キー固定",
    description: "キーの押しっぱなし状態を切り替える。もう一度押すと解除",
    category: "basic",
  },
  "Key Repeat": {
    label: "キーリピート",
    description: "直前に押したキーをもう一度送信する",
    category: "basic",
  },
  "Sticky Key": {
    label: "ワンショット修飾",
    description:
      "一度押すと次のキー入力だけに修飾（Shift等）を適用する。連打で固定",
    category: "basic",
  },
  "Grave/Escape": {
    label: "Grave / Escape",
    description:
      "単体押しでEsc、Shiftと同時で `（バッククォート）を入力する",
    category: "basic",
  },
  "Caps Word": {
    label: "Caps Word",
    description:
      "一時的に大文字モードをON。スペースや記号を押すと自動で解除される",
    category: "basic",
  },
  "Hold-Tap": {
    label: "長押し / タップ",
    description:
      "短く押すとタップ動作、長押しで別の動作（修飾キーやレイヤー切替）を実行",
    category: "basic",
  },
  "Mod-Tap": {
    label: "修飾キー / タップ",
    description:
      "短く押すと通常キー、長押しで修飾キー（Ctrl, Shift等）として動作",
    category: "basic",
  },
  "Layer-Tap": {
    label: "レイヤー / タップ",
    description: "短く押すと通常キー、長押しでレイヤーを一時的に切り替える",
    category: "layer",
  },
  "Momentary Layer": {
    label: "一時レイヤー",
    description: "押している間だけ指定レイヤーに切り替える。離すと元に戻る",
    category: "layer",
  },
  "Toggle Layer": {
    label: "レイヤー切替",
    description: "指定レイヤーのON/OFFを切り替える。もう一度押すと元に戻る",
    category: "layer",
  },
  "Sticky Layer": {
    label: "ワンショットレイヤー",
    description:
      "次の1キーだけ指定レイヤーで入力する。入力後に自動で元に戻る",
    category: "layer",
  },
  "To Layer": {
    label: "レイヤー移動",
    description:
      "指定レイヤーに完全に移動する。他のレイヤーは全てOFFになる",
    category: "layer",
  },
  "Conditional Layer": {
    label: "条件付きレイヤー",
    description: "指定した複数レイヤーが同時ONの時に自動でONになるレイヤー",
    category: "layer",
  },
  "Bluetooth": {
    label: "Bluetooth操作",
    description:
      "BLEプロファイルの切替・クリアなどBluetooth接続を制御する",
    category: "bluetooth",
  },
  "Output Selection": {
    label: "出力切替",
    description: "キーボードの出力先をUSBとBluetoothの間で切り替える",
    category: "bluetooth",
  },
  "BLE Management": {
    label: "BLE管理",
    description: "BLE接続の詳細管理（ペアリング、切断等）",
    category: "bluetooth",
  },
  Transparent: {
    label: "透過",
    description:
      "このレイヤーでは何も割り当てず、下のレイヤーの割り当てをそのまま使う",
    category: "system",
  },
  None: {
    label: "無効",
    description: "このキーを無効化する。押しても何も起きない",
    category: "system",
  },
  Bootloader: {
    label: "ブートローダー",
    description:
      "ファームウェア書き込みモードに入る。ファームウェア更新時に使用",
    category: "system",
  },
  Reset: {
    label: "リセット",
    description: "キーボードを再起動する",
    category: "system",
  },
  "Soft Off": {
    label: "電源OFF",
    description: "キーボードをソフトウェアでシャットダウンする（省電力）",
    category: "system",
  },
  "External Power": {
    label: "外部電源",
    description: "外部電源（LED等）のON/OFFを切り替える",
    category: "system",
  },
  "Studio Unlock": {
    label: "Studio解除",
    description: "ZMK Studioからのキーマップ変更を許可する",
    category: "system",
  },
  Macro: {
    label: "マクロ",
    description: "事前に登録したキー操作の連続入力を実行する",
    category: "basic",
  },
  "Mouse Key Press": {
    label: "マウスキー",
    description: "マウスのクリックや移動をキーボードから操作する",
    category: "basic",
  },
  Backlight: {
    label: "バックライト",
    description: "キーボードのバックライトを制御する",
    category: "system",
  },
  "RGB Underglow": {
    label: "RGB制御",
    description: "RGBアンダーグローの色やエフェクトを変更する",
    category: "system",
  },
};

export function getBehaviorDescription(
  displayName: string
): BehaviorDescription {
  return (
    descriptions[displayName] ?? {
      label: displayName,
      description: "",
      category: "other" as BehaviorCategory,
    }
  );
}
