import type { DriveStep } from "driver.js";

export const TOUR_SELECTORS = {
  keymapArea: "[data-tour='keymap-area']",
  bindingPanel: "[data-tour='binding-panel']",
  layerPicker: "[data-tour='layer-picker']",
  exportImport: "[data-tour='export-import']",
  osToggle: "[data-tour='os-toggle']",
  undoRedo: "[data-tour='undo-redo']",
  saveDiscard: "[data-tour='save-discard']",
  tab: (id: string) => `[data-tour='tab-${id}']`,
} as const;

export function buildTourSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: "minimal-keys カスタマイズへようこそ",
        description: "主な機能を約1分でご紹介します。",
      },
    },
    {
      element: TOUR_SELECTORS.keymapArea,
      popover: {
        title: "キーボードエリア",
        description: "キーをクリックすると割り当てを変更できます。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.bindingPanel,
      popover: {
        title: "キー設定パネル",
        description: "選択したキーの動作をここで細かく設定します。",
        side: "top",
      },
    },
    {
      element: TOUR_SELECTORS.layerPicker,
      popover: {
        title: "レイヤー",
        description: "レイヤーの切り替え・追加・名前変更ができます。",
        side: "right",
      },
    },
    {
      element: TOUR_SELECTORS.exportImport,
      popover: {
        title: "キーマップの保存と読込",
        description: "設定をファイルに書き出し・読み込みできます。",
        side: "right",
      },
    },
    {
      element: TOUR_SELECTORS.osToggle,
      popover: {
        title: "OS切り替え",
        description: "Mac / Windows でキーの表示を切り替えます。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.undoRedo,
      popover: {
        title: "元に戻す / やり直し",
        description: "変更はいつでも取り消せます。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.saveDiscard,
      popover: {
        title: "保存 / 破棄",
        description: "変更はキーボード本体に保存されます。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.tab("keymap"),
      popover: {
        title: "キーマップ",
        description: "今ご覧いただいたキー割り当ての画面です。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.tab("holdtap"),
      popover: {
        title: "長押し設定",
        description: "長押しとタップで動作を変える設定です。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.tab("encoder"),
      popover: {
        title: "エンコーダー",
        description: "ロータリーエンコーダーの動作を設定します。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.tab("combo"),
      popover: {
        title: "コンボ",
        description: "複数キーの同時押しに動作を割り当てます。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.tab("trackball"),
      popover: {
        title: "トラックボール",
        description: "ポインター速度などを調整します。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.tab("bluetooth"),
      popover: {
        title: "Bluetooth",
        description: "接続先デバイスの管理を行います。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.tab("battery"),
      popover: {
        title: "バッテリー",
        description: "電池残量の履歴を確認できます。",
        side: "bottom",
      },
    },
    {
      element: TOUR_SELECTORS.tab("settings"),
      popover: {
        title: "設定",
        description: "デバイス設定や利用データ送信の変更はこちら。",
        side: "bottom",
      },
    },
    {
      popover: {
        title: "ツアーは以上です",
        description: "フッターの「使い方を見る」からいつでも見直せます。",
      },
    },
  ];
}
