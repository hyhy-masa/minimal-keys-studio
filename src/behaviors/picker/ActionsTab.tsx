import { useMemo, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { hid_usage_from_page_and_id } from "../../hid-usages";
import { detectOS } from "../use-cases";

const KB = 7;
const CONSUMER = 12;

// HID helpers — same pattern as use-cases.ts
const key = (id: number) => hid_usage_from_page_and_id(KB, id);
const ctrl = (usage: number) => (0x01 << 24) | usage;
const gui = (usage: number) => (0x08 << 24) | usage;
function shortcut(os: string, usage: number): number {
  return os === "mac" ? gui(usage) : ctrl(usage);
}

interface ActionItem {
  label: string;
  description: string;
  behaviorName: string; // "Key Press" or "Mouse Key Press"
  param1: number;
}

function getShortcutItems(os: string): ActionItem[] {
  const modLabel = os === "mac" ? "⌘" : "Ctrl";
  return [
    {
      label: "コピー",
      description: `${modLabel}+C`,
      behaviorName: "Key Press",
      param1: shortcut(os, key(6)),
    },
    {
      label: "貼り付け",
      description: `${modLabel}+V`,
      behaviorName: "Key Press",
      param1: shortcut(os, key(25)),
    },
    {
      label: "切り取り",
      description: `${modLabel}+X`,
      behaviorName: "Key Press",
      param1: shortcut(os, key(27)),
    },
    {
      label: "元に戻す",
      description: `${modLabel}+Z`,
      behaviorName: "Key Press",
      param1: shortcut(os, key(29)),
    },
    {
      label: "やり直す",
      description: os === "mac" ? "⌘+Shift+Z" : "Ctrl+Y",
      behaviorName: "Key Press",
      param1:
        os === "mac"
          ? (0x0a << 24) | key(29) // Cmd+Shift+Z
          : ctrl(key(28)), // Ctrl+Y
    },
    {
      label: "保存",
      description: `${modLabel}+S`,
      behaviorName: "Key Press",
      param1: shortcut(os, key(22)),
    },
    {
      label: "全選択",
      description: `${modLabel}+A`,
      behaviorName: "Key Press",
      param1: shortcut(os, key(4)),
    },
    {
      label: "検索",
      description: `${modLabel}+F`,
      behaviorName: "Key Press",
      param1: shortcut(os, key(9)),
    },
    {
      label: "新規タブ",
      description: `${modLabel}+T`,
      behaviorName: "Key Press",
      param1: shortcut(os, key(23)),
    },
    {
      label: "タブを閉じる",
      description: `${modLabel}+W`,
      behaviorName: "Key Press",
      param1: shortcut(os, key(26)),
    },
  ];
}

const mouseItems: ActionItem[] = [
  { label: "左クリック", description: "選択・決定", behaviorName: "Mouse Key Press", param1: 1 },
  { label: "右クリック", description: "メニューを開く", behaviorName: "Mouse Key Press", param1: 2 },
  { label: "中クリック", description: "新しいタブで開く", behaviorName: "Mouse Key Press", param1: 3 },
  { label: "戻る", description: "前のページへ戻る", behaviorName: "Mouse Key Press", param1: 4 },
  { label: "進む", description: "次のページへ進む", behaviorName: "Mouse Key Press", param1: 5 },
];

const mediaItems: ActionItem[] = [
  {
    label: "再生/一時停止",
    description: "メディア再生制御",
    behaviorName: "Key Press",
    param1: hid_usage_from_page_and_id(CONSUMER, 0xcd),
  },
  {
    label: "音量を上げる",
    description: "Volume Up",
    behaviorName: "Key Press",
    param1: hid_usage_from_page_and_id(CONSUMER, 0xe9),
  },
  {
    label: "音量を下げる",
    description: "Volume Down",
    behaviorName: "Key Press",
    param1: hid_usage_from_page_and_id(CONSUMER, 0xea),
  },
  {
    label: "ミュート",
    description: "消音",
    behaviorName: "Key Press",
    param1: hid_usage_from_page_and_id(CONSUMER, 0xe2),
  },
  {
    label: "次の曲",
    description: "Next Track",
    behaviorName: "Key Press",
    param1: hid_usage_from_page_and_id(CONSUMER, 0xb5),
  },
  {
    label: "前の曲",
    description: "Previous Track",
    behaviorName: "Key Press",
    param1: hid_usage_from_page_and_id(CONSUMER, 0xb6),
  },
  {
    label: "画面を明るく",
    description: "Brightness Up",
    behaviorName: "Key Press",
    param1: hid_usage_from_page_and_id(CONSUMER, 0x6f),
  },
  {
    label: "画面を暗く",
    description: "Brightness Down",
    behaviorName: "Key Press",
    param1: hid_usage_from_page_and_id(CONSUMER, 0x70),
  },
];

const navItems: ActionItem[] = [
  { label: "↑", description: "上に移動", behaviorName: "Key Press", param1: hid_usage_from_page_and_id(KB, 82) },
  { label: "↓", description: "下に移動", behaviorName: "Key Press", param1: hid_usage_from_page_and_id(KB, 81) },
  { label: "←", description: "左に移動", behaviorName: "Key Press", param1: hid_usage_from_page_and_id(KB, 80) },
  { label: "→", description: "右に移動", behaviorName: "Key Press", param1: hid_usage_from_page_and_id(KB, 79) },
  { label: "Home", description: "行の先頭へ", behaviorName: "Key Press", param1: hid_usage_from_page_and_id(KB, 74) },
  { label: "End", description: "行の末尾へ", behaviorName: "Key Press", param1: hid_usage_from_page_and_id(KB, 77) },
  { label: "Page Up", description: "1ページ上へ", behaviorName: "Key Press", param1: hid_usage_from_page_and_id(KB, 75) },
  {
    label: "Page Down",
    description: "1ページ下へ",
    behaviorName: "Key Press",
    param1: hid_usage_from_page_and_id(KB, 78),
  },
  {
    label: "PrintScreen",
    description: "画面キャプチャ",
    behaviorName: "Key Press",
    param1: hid_usage_from_page_and_id(KB, 70),
  },
];

type SubCategory = "shortcuts" | "mouse" | "media" | "nav";

const subCategories: { id: SubCategory; label: string }[] = [
  { id: "shortcuts", label: "ショートカット" },
  { id: "mouse", label: "マウス" },
  { id: "media", label: "メディア" },
  { id: "nav", label: "ナビゲーション" },
];

interface ActionsTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function ActionsTab({ behaviors, onApplyBinding }: ActionsTabProps) {
  const [activeSub, setActiveSub] = useState<SubCategory>("shortcuts");
  const os = useMemo(() => detectOS(), []);

  const behaviorIdMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of behaviors) {
      map[b.displayName] = b.id;
    }
    return map;
  }, [behaviors]);

  const shortcutItems = useMemo(() => getShortcutItems(os), [os]);

  const activeItems: ActionItem[] = (() => {
    switch (activeSub) {
      case "shortcuts":
        return shortcutItems;
      case "mouse":
        return mouseItems;
      case "media":
        return mediaItems;
      case "nav":
        return navItems;
    }
  })();

  const handleItemClick = (item: ActionItem) => {
    const behaviorId = behaviorIdMap[item.behaviorName];
    if (behaviorId === undefined) return;
    onApplyBinding({ behaviorId, param1: item.param1, param2: 0 });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 flex-wrap">
        {subCategories.map((sub) => (
          <button
            key={sub.id}
            className={`px-3 py-1 text-sm rounded-md ${
              activeSub === sub.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-base-content/50 hover:text-base-content hover:bg-base-200"
            }`}
            onClick={() => setActiveSub(sub.id)}
          >
            {sub.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {activeItems.map((item, i) => (
          <button
            key={i}
            className="flex items-center gap-3 px-3 py-2 text-sm rounded-md border border-base-300 bg-white hover:bg-primary/10 hover:border-primary/30 transition-all text-left"
            onClick={() => handleItemClick(item)}
          >
            <span className="font-medium">{item.label}</span>
            <span className="text-base-content/50">{item.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
