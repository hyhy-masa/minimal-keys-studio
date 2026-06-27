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

// Labels are OS-dependent: Cmd on Mac, Win on Windows
interface ModifierDef {
  macLabel: string;
  winLabel: string;
  symbol: string;
  winSymbol: string;
  hidId: number;
  bitmask: number;
}

const modifierDefs: ModifierDef[] = [
  { macLabel: "Ctrl (左)", winLabel: "Ctrl (左)", symbol: "⌃", winSymbol: "⌃", hidId: 224, bitmask: 0x01 },
  { macLabel: "Shift (左)", winLabel: "Shift (左)", symbol: "⇧", winSymbol: "⇧", hidId: 225, bitmask: 0x02 },
  { macLabel: "Alt/Option (左)", winLabel: "Alt (左)", symbol: "⌥", winSymbol: "Alt", hidId: 226, bitmask: 0x04 },
  { macLabel: "⌘ Cmd (左)", winLabel: "Win (左)", symbol: "⌘", winSymbol: "⊞", hidId: 227, bitmask: 0x08 },
  { macLabel: "Ctrl (右)", winLabel: "Ctrl (右)", symbol: "⌃", winSymbol: "⌃", hidId: 228, bitmask: 0x10 },
  { macLabel: "Shift (右)", winLabel: "Shift (右)", symbol: "⇧", winSymbol: "⇧", hidId: 229, bitmask: 0x20 },
  { macLabel: "Alt/Option (右)", winLabel: "Alt (右)", symbol: "⌥", winSymbol: "Alt", hidId: 230, bitmask: 0x40 },
  { macLabel: "⌘ Cmd (右)", winLabel: "Win (右)", symbol: "⌘", winSymbol: "⊞", hidId: 231, bitmask: 0x80 },
];

function getModifiers(os: import("../use-cases").UserOS): ModifierItem[] {
  return modifierDefs.map((d) => ({
    label: os === "mac" ? d.macLabel : d.winLabel,
    symbol: os === "mac" ? d.symbol : d.winSymbol,
    hidId: d.hidId,
    bitmask: d.bitmask,
  }));
}

import { commonTapKeys, type TapKeyItem } from "./common-tap-keys";

type Mode = "standalone" | "mod-tap";

interface ModifiersTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  osMode: import("../use-cases").UserOS;
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function ModifiersTab({ behaviors, osMode, onApplyBinding }: ModifiersTabProps) {
  const [mode, setMode] = useState<Mode>("standalone");
  const [selectedModifier, setSelectedModifier] = useState<ModifierItem | null>(null);
  const [selectedTapKey, setSelectedTapKey] = useState<TapKeyItem | null>(null);

  const modifiers = useMemo(() => getModifiers(osMode), [osMode]);

  const behaviorIdMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of behaviors) {
      map[b.displayName] = b.id;
    }
    return map;
  }, [behaviors]);

  const hasModTap = behaviorIdMap["Mod-Tap"] !== undefined;


  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setSelectedModifier(null);
    setSelectedTapKey(null);
  };

  const handleModifierClick = (mod: ModifierItem) => {
    setSelectedModifier(mod);
    setSelectedTapKey(null);
  };

  const handleTapKeyClick = (item: TapKeyItem) => {
    setSelectedTapKey(item);
  };

  const handleApply = () => {
    if (!selectedModifier) return;

    if (mode === "standalone") {
      const behaviorId = behaviorIdMap["Key Press"];
      if (behaviorId === undefined) return;
      onApplyBinding({
        behaviorId,
        param1: hid_usage_from_page_and_id(KB, selectedModifier.hidId),
        param2: 0,
      });
    } else if (mode === "mod-tap") {
      if (selectedTapKey === null) return;
      const behaviorId = behaviorIdMap["Mod-Tap"];
      if (behaviorId === undefined) return;
      let param2 = hid_usage_from_page_and_id(KB, selectedTapKey.hidId);
      if (selectedTapKey.modifier) {
        param2 = (selectedTapKey.modifier << 24) | param2;
      }
      onApplyBinding({
        behaviorId,
        param1: hid_usage_from_page_and_id(KB, selectedModifier.hidId),
        param2,
      });
    }
  };

  const modes: { id: Mode; label: string; description: string; available: boolean }[] = [
    { id: "standalone", label: "修飾キー", description: "押している間だけ修飾", available: true },
    { id: "mod-tap", label: "Mod-Tap", description: "短押し=キー、長押し=修飾キー", available: hasModTap },
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
            <span className="text-sm text-base-content/50">{m.description}</span>
          </button>
        ))}
      </div>

      {/* Modifier selection */}
      <div>
        <div className="text-sm text-base-content/60 mb-1">
          修飾キーを選択
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
                key={key.modifier ? `s${key.hidId}` : key.hidId}
                className={`px-2 py-1.5 text-sm rounded-md border text-center ${
                  selectedTapKey?.hidId === key.hidId && selectedTapKey?.modifier === key.modifier
                    ? "bg-primary/10 text-primary border-primary/30 font-medium"
                    : "border-base-300 bg-white hover:bg-base-200 text-base-content"
                }`}
                onClick={() => handleTapKeyClick(key)}
              >
                {key.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Apply button */}
      <button
        className="self-start px-4 py-2 text-sm rounded-md bg-primary text-primary-content font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={
          selectedModifier === null ||
          (mode === "mod-tap" && selectedTapKey === null)
        }
        onClick={handleApply}
      >
        適用する
      </button>
    </div>
  );
}
