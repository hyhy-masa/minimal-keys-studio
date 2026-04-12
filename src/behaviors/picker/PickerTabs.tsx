import { useMemo, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { detectOS, type UserOS } from "../use-cases";
import { LettersTab } from "./LettersTab";
import { ActionsTab } from "./ActionsTab";
import { LayersTab } from "./LayersTab";
import { ModifiersTab } from "./ModifiersTab";
import { SystemTab } from "./SystemTab";
import { JapaneseTab } from "./JapaneseTab";

type TabId = "actions" | "letters" | "layers" | "modifiers" | "japanese" | "system";

interface PickerTabsProps {
  keyPosition: number;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

const tabs: { id: TabId; label: string }[] = [
  { id: "actions", label: "ショートカット" },
  { id: "letters", label: "文字・記号" },
  { id: "layers", label: "レイヤー" },
  { id: "modifiers", label: "修飾キー" },
  { id: "japanese", label: "日本語" },
  { id: "system", label: "システム" },
];

export function PickerTabs({
  keyPosition,
  behaviors,
  layers,
  onApplyBinding,
}: PickerTabsProps) {
  const detectedOS = useMemo(() => detectOS(), []);
  const [osMode, setOsMode] = useState<UserOS>(detectedOS);
  const [activeTab, setActiveTab] = useState<TabId>("actions");

  return (
    <div className="flex flex-col gap-2">
      {/* OS mode toggle */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs text-base-content/40">OS:</span>
        <div className="flex bg-base-200 rounded-md p-0.5">
          <button
            className={`px-2.5 py-0.5 text-xs rounded transition-all ${
              osMode === "mac"
                ? "bg-white text-primary font-medium shadow-sm"
                : "text-base-content/50 hover:text-base-content"
            }`}
            onClick={() => setOsMode("mac")}
          >
            Mac
          </button>
          <button
            className={`px-2.5 py-0.5 text-xs rounded transition-all ${
              osMode === "windows"
                ? "bg-white text-primary font-medium shadow-sm"
                : "text-base-content/50 hover:text-base-content"
            }`}
            onClick={() => setOsMode("windows")}
          >
            Windows
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 bg-base-200 p-1 rounded-lg overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`px-3 py-1.5 text-sm rounded-md transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-white text-primary font-medium shadow-sm"
                : "text-base-content/50 hover:text-base-content"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[6rem]">
        {activeTab === "actions" && (
          <ActionsTab
            keyPosition={keyPosition}
            behaviors={behaviors}
            layers={layers}
            osMode={osMode}
            onApplyBinding={onApplyBinding}
          />
        )}
        {activeTab === "letters" && (
          <LettersTab behaviors={behaviors} onApplyBinding={onApplyBinding} />
        )}
        {activeTab === "layers" && (
          <LayersTab behaviors={behaviors} layers={layers} onApplyBinding={onApplyBinding} />
        )}
        {activeTab === "modifiers" && (
          <ModifiersTab behaviors={behaviors} layers={layers} osMode={osMode} onApplyBinding={onApplyBinding} />
        )}
        {activeTab === "japanese" && (
          <JapaneseTab behaviors={behaviors} osMode={osMode} onApplyBinding={onApplyBinding} />
        )}
        {activeTab === "system" && (
          <SystemTab behaviors={behaviors} onApplyBinding={onApplyBinding} />
        )}
      </div>
    </div>
  );
}
