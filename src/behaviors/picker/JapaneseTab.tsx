import { useMemo } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { hid_usage_from_page_and_id } from "../../hid-usages";

const KB = 7;

interface JpKeyItem {
  label: string;
  description: string;
  hidId: number;
}

// International keys (HID 135-145)
const jpKeys: JpKeyItem[] = [
  { label: "半角/全角", description: "IME ON/OFF（Windows）", hidId: 53 }, // Grave/Tilde — used as Hankaku/Zenkaku on JP keyboards
  { label: "変換", description: "変換キー", hidId: 138 }, // International 4
  { label: "無変換", description: "無変換キー", hidId: 139 }, // International 5
  { label: "かな", description: "カタカナ/ひらがな", hidId: 136 }, // International 2
  { label: "¥", description: "円記号・バックスラッシュ", hidId: 137 }, // International 3
  { label: "LANG1", description: "IME ON（Mac: かな）", hidId: 144 },
  { label: "LANG2", description: "IME OFF（Mac: 英数）", hidId: 145 },
  { label: "全角/半角", description: "International 1", hidId: 135 }, // International 1
  { label: "LANG3", description: "カタカナ", hidId: 146 },
  { label: "LANG4", description: "ひらがな", hidId: 147 },
];

interface JapaneseTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function JapaneseTab({ behaviors, onApplyBinding }: JapaneseTabProps) {
  const keyPressBehaviorId = useMemo(
    () => behaviors.find((b) => b.displayName === "Key Press")?.id,
    [behaviors],
  );

  const handleClick = (hidId: number) => {
    if (keyPressBehaviorId === undefined) return;
    onApplyBinding({
      behaviorId: keyPressBehaviorId,
      param1: hid_usage_from_page_and_id(KB, hidId),
      param2: 0,
    });
  };

  return (
    <div className="flex flex-col gap-1">
      {jpKeys.map((key) => (
        <button
          key={key.hidId}
          className="flex items-center gap-3 px-3 py-2 text-sm rounded-md border border-base-300 bg-white hover:bg-primary/10 hover:border-primary/30 transition-all text-left"
          onClick={() => handleClick(key.hidId)}
        >
          <span className="font-medium min-w-[5rem]">{key.label}</span>
          <span className="text-base-content/50">{key.description}</span>
        </button>
      ))}
    </div>
  );
}
