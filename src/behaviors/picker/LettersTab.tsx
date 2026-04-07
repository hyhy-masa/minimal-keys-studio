import { useMemo, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { hid_usage_from_page_and_id } from "../../hid-usages";

const KB_PAGE = 7;

interface KeyItem {
  label: string;
  hidId: number;
}

const letterKeys: KeyItem[] = Array.from({ length: 26 }, (_, i) => ({
  label: String.fromCharCode(65 + i),
  hidId: 4 + i,
}));

const numberKeys: KeyItem[] = [
  ...Array.from({ length: 9 }, (_, i) => ({
    label: String(i + 1),
    hidId: 30 + i,
  })),
  { label: "0", hidId: 39 },
];

const fKeys: KeyItem[] = Array.from({ length: 12 }, (_, i) => ({
  label: `F${i + 1}`,
  hidId: 58 + i,
}));

const fKeysExtended: KeyItem[] = Array.from({ length: 12 }, (_, i) => ({
  label: `F${i + 13}`,
  hidId: 104 + i,
}));

const symbolKeys: KeyItem[] = [
  { label: "-", hidId: 45 },
  { label: "=", hidId: 46 },
  { label: "[", hidId: 47 },
  { label: "]", hidId: 48 },
  { label: "\\", hidId: 49 },
  { label: "#", hidId: 50 },
  { label: ";", hidId: 51 },
  { label: "'", hidId: 52 },
  { label: "`", hidId: 53 },
  { label: ",", hidId: 54 },
  { label: ".", hidId: 55 },
  { label: "/", hidId: 56 },
];

const specialKeys: KeyItem[] = [
  { label: "Enter", hidId: 40 },
  { label: "Esc", hidId: 41 },
  { label: "BS", hidId: 42 },
  { label: "Tab", hidId: 43 },
  { label: "Space", hidId: 44 },
  { label: "Delete", hidId: 76 },
  { label: "Insert", hidId: 73 },
  { label: "Caps Lock", hidId: 57 },
  { label: "PrtSc", hidId: 70 },
  { label: "Scroll Lock", hidId: 71 },
  { label: "Pause", hidId: 72 },
  { label: "Menu", hidId: 101 },
];

const keypadKeys: KeyItem[] = [
  { label: "Num Lock", hidId: 83 },
  { label: "KP /", hidId: 84 },
  { label: "KP *", hidId: 85 },
  { label: "KP -", hidId: 86 },
  { label: "KP +", hidId: 87 },
  { label: "KP Enter", hidId: 88 },
  { label: "KP 1", hidId: 89 },
  { label: "KP 2", hidId: 90 },
  { label: "KP 3", hidId: 91 },
  { label: "KP 4", hidId: 92 },
  { label: "KP 5", hidId: 93 },
  { label: "KP 6", hidId: 94 },
  { label: "KP 7", hidId: 95 },
  { label: "KP 8", hidId: 96 },
  { label: "KP 9", hidId: 97 },
  { label: "KP 0", hidId: 98 },
  { label: "KP .", hidId: 99 },
];

type SubCategory = "letters" | "numbers" | "fkeys" | "fkeys2" | "symbols" | "special" | "keypad";

const subCategories: { id: SubCategory; label: string; keys: KeyItem[] }[] = [
  { id: "letters", label: "A-Z", keys: letterKeys },
  { id: "numbers", label: "0-9", keys: numberKeys },
  { id: "fkeys", label: "F1-F12", keys: fKeys },
  { id: "fkeys2", label: "F13-F24", keys: fKeysExtended },
  { id: "symbols", label: "記号", keys: symbolKeys },
  { id: "special", label: "特殊", keys: specialKeys },
  { id: "keypad", label: "テンキー", keys: keypadKeys },
];

interface LettersTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function LettersTab({ behaviors, onApplyBinding }: LettersTabProps) {
  const [activeSub, setActiveSub] = useState<SubCategory>("letters");

  const keyPressBehaviorId = useMemo(
    () => behaviors.find((b) => b.displayName === "Key Press")?.id,
    [behaviors],
  );

  const activeKeys = subCategories.find((s) => s.id === activeSub)?.keys ?? [];

  const handleKeyClick = (hidId: number) => {
    if (keyPressBehaviorId === undefined) return;
    onApplyBinding({
      behaviorId: keyPressBehaviorId,
      param1: hid_usage_from_page_and_id(KB_PAGE, hidId),
      param2: 0,
    });
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
      <div className="grid grid-cols-8 gap-1">
        {activeKeys.map((key) => (
          <button
            key={key.hidId}
            className="px-2 py-2 text-sm rounded-md border border-base-300 bg-white hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all text-center"
            onClick={() => handleKeyClick(key.hidId)}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}
