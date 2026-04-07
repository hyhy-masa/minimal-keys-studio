import { useMemo, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { hid_usage_from_page_and_id } from "../../hid-usages";

const KB = 7;

interface ModifierItem {
  label: string;
  symbol: string;
  hidId: number; // for standalone Key Press
  bitmask: number; // for Mod-Tap / Sticky Key
}

const modifiers: ModifierItem[] = [
  { label: "Ctrl (左)", symbol: "⌃", hidId: 224, bitmask: 0x01 },
  { label: "Shift (左)", symbol: "⇧", hidId: 225, bitmask: 0x02 },
  { label: "Alt (左)", symbol: "⌥", hidId: 226, bitmask: 0x04 },
  { label: "Cmd/Win (左)", symbol: "⌘", hidId: 227, bitmask: 0x08 },
  { label: "Ctrl (右)", symbol: "⌃", hidId: 228, bitmask: 0x10 },
  { label: "Shift (右)", symbol: "⇧", hidId: 229, bitmask: 0x20 },
  { label: "Alt (右)", symbol: "⌥", hidId: 230, bitmask: 0x40 },
  { label: "Cmd/Win (右)", symbol: "⌘", hidId: 231, bitmask: 0x80 },
];

import { commonTapKeys } from "./common-tap-keys";

type Mode = "standalone" | "mod-tap" | "sticky";

interface ModifiersTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function ModifiersTab({ behaviors, onApplyBinding }: ModifiersTabProps) {
  const [mode, setMode] = useState<Mode>("standalone");
  const [selectedModifier, setSelectedModifier] = useState<ModifierItem | null>(null);
  const [selectedTapKey, setSelectedTapKey] = useState<number | null>(null);

  const behaviorIdMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of behaviors) {
      map[b.displayName] = b.id;
    }
    return map;
  }, [behaviors]);

  const hasModTap = behaviorIdMap["Mod-Tap"] !== undefined;
  const hasStickyKey = behaviorIdMap["Sticky Key"] !== undefined;

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setSelectedModifier(null);
    setSelectedTapKey(null);
  };

  const handleModifierClick = (mod: ModifierItem) => {
    setSelectedModifier(mod);
    setSelectedTapKey(null);

    if (mode === "standalone") {
      const behaviorId = behaviorIdMap["Key Press"];
      if (behaviorId !== undefined) {
        onApplyBinding({
          behaviorId,
          param1: hid_usage_from_page_and_id(KB, mod.hidId),
          param2: 0,
        });
      }
    } else if (mode === "sticky") {
      const behaviorId = behaviorIdMap["Sticky Key"];
      if (behaviorId !== undefined) {
        onApplyBinding({
          behaviorId,
          param1: mod.bitmask,
          param2: 0,
        });
      }
    }
    // mod-tap: wait for tap key selection
  };

  const handleTapKeyClick = (hidId: number) => {
    setSelectedTapKey(hidId);
  };

  const handleApply = () => {
    if (!selectedModifier || selectedTapKey === null) return;
    const behaviorId = behaviorIdMap["Mod-Tap"];
    if (behaviorId === undefined) return;
    onApplyBinding({
      behaviorId,
      param1: selectedModifier.bitmask,
      param2: hid_usage_from_page_and_id(KB, selectedTapKey),
    });
  };

  const modes: { id: Mode; label: string; description: string; available: boolean }[] = [
    { id: "standalone", label: "修飾キー", description: "押している間だけ修飾", available: true },
    { id: "mod-tap", label: "Mod-Tap", description: "短押し=キー、長押し=修飾キー", available: hasModTap },
    { id: "sticky", label: "ワンショット", description: "次の1キーだけ修飾", available: hasStickyKey },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Mode selection */}
      <div className="flex gap-1 flex-wrap">
        {modes.filter((m) => m.available).map((m) => (
          <button
            key={m.id}
            className={`flex flex-col items-start px-3 py-2 text-sm rounded-md border ${
              mode === m.id
                ? "bg-primary/10 text-primary border-primary/30 font-medium"
                : "border-base-300 bg-white hover:bg-base-200 text-base-content"
            }`}
            onClick={() => handleModeChange(m.id)}
          >
            <span className="font-medium">{m.label}</span>
            <span className="text-xs text-base-content/50">{m.description}</span>
          </button>
        ))}
      </div>

      {/* Modifier selection */}
      <div>
        <div className="text-sm text-base-content/60 mb-1">
          {mode === "standalone" ? "修飾キーを選択（即適用）" : "修飾キーを選択"}
        </div>
        <div className="grid grid-cols-2 gap-1">
          {modifiers.map((mod) => (
            <button
              key={mod.hidId}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md border ${
                selectedModifier?.hidId === mod.hidId
                  ? "bg-primary/10 text-primary border-primary/30 font-medium"
                  : "border-base-300 bg-white hover:bg-base-200 text-base-content"
              }`}
              onClick={() => handleModifierClick(mod)}
            >
              <span className="text-lg">{mod.symbol}</span>
              <span>{mod.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tap key selection for Mod-Tap */}
      {mode === "mod-tap" && selectedModifier && (
        <div>
          <div className="text-sm text-base-content/60 mb-1">タップキーを選択</div>
          <div className="grid grid-cols-8 gap-1 max-h-32 overflow-y-auto">
            {commonTapKeys.map((key) => (
              <button
                key={key.hidId}
                className={`px-2 py-1.5 text-sm rounded-md border text-center ${
                  selectedTapKey === key.hidId
                    ? "bg-primary/10 text-primary border-primary/30 font-medium"
                    : "border-base-300 bg-white hover:bg-base-200 text-base-content"
                }`}
                onClick={() => handleTapKeyClick(key.hidId)}
              >
                {key.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Apply button for Mod-Tap */}
      {mode === "mod-tap" && (
        <button
          className="self-start px-4 py-2 text-sm rounded-md bg-primary text-primary-content font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={selectedModifier === null || selectedTapKey === null}
          onClick={handleApply}
        >
          適用する
        </button>
      )}
    </div>
  );
}
