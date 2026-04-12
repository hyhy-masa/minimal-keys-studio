import { useMemo } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { UserOS } from "../use-cases";
import { hid_usage_from_page_and_id } from "../../hid-usages";

const KB = 7;

interface JpFunctionItem {
  label: string;
  description: string;
  hidId: number;
  modifier?: number; // modifier bitmask (shifted left 24 bits when applied)
}

// Mac: LANG1/LANG2 for IME toggle
const macItems: JpFunctionItem[] = [
  { label: "日本語にする", description: "かな入力に切替（LANG1）", hidId: 144 },
  { label: "英語にする", description: "英数入力に切替（LANG2）", hidId: 145 },
];

// Windows: Grave key acts as 半角/全角 toggle (with JP keyboard layout)
const windowsItems: JpFunctionItem[] = [
  { label: "IME切替", description: "半角/全角トグル（`キー送信）", hidId: 53 },
];

// Common keys (work on both OS)
const commonItems: JpFunctionItem[] = [
  { label: "変換", description: "変換キー", hidId: 138 },
  { label: "無変換", description: "無変換キー", hidId: 139 },
  { label: "かな", description: "カタカナ/ひらがな切替", hidId: 136 },
  { label: "¥", description: "円記号・バックスラッシュ", hidId: 137 },
];

interface JapaneseTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  osMode: UserOS;
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function JapaneseTab({ behaviors, osMode, onApplyBinding }: JapaneseTabProps) {
  const keyPressBehaviorId = useMemo(
    () => behaviors.find((b) => b.displayName === "Key Press")?.id,
    [behaviors],
  );

  const handleClick = (item: JpFunctionItem) => {
    if (keyPressBehaviorId === undefined) return;
    let param1 = hid_usage_from_page_and_id(KB, item.hidId);
    if (item.modifier) {
      param1 = (item.modifier << 24) | param1;
    }
    onApplyBinding({
      behaviorId: keyPressBehaviorId,
      param1,
      param2: 0,
    });
  };

  const osSpecificItems = osMode === "mac" ? macItems : windowsItems;
  const osLabel = osMode === "mac" ? "Mac" : "Windows";

  return (
    <div className="flex flex-col gap-3">
      {/* OS-specific IME toggle section */}
      <div>
        <div className="text-sm text-base-content/60 mb-1">{osLabel} — IME切替</div>
        <div className="flex flex-col gap-1">
          {osSpecificItems.map((item) => (
            <button
              key={item.hidId}
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-md border border-base-300 bg-white hover:bg-primary/10 hover:border-primary/30 transition-all text-left"
              onClick={() => handleClick(item)}
            >
              <span className="font-medium min-w-[6rem]">{item.label}</span>
              <span className="text-base-content/50">{item.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Common keys (both OS) */}
      <div>
        <div className="text-sm text-base-content/60 mb-1">共通キー</div>
        <div className="flex flex-col gap-1">
          {commonItems.map((item) => (
            <button
              key={item.hidId}
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-md border border-base-300 bg-white hover:bg-primary/10 hover:border-primary/30 transition-all text-left"
              onClick={() => handleClick(item)}
            >
              <span className="font-medium min-w-[6rem]">{item.label}</span>
              <span className="text-base-content/50">{item.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
