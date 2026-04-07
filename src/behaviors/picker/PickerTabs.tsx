import { useEffect, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { keyRoleMap } from "../../keyboard/key-roles";
import { RecommendationsTab } from "./RecommendationsTab";
import { LettersTab } from "./LettersTab";
import { ActionsTab } from "./ActionsTab";
import { LayersTab } from "./LayersTab";

type TabId = "recommendations" | "letters" | "actions" | "layers" | "modifiers" | "system";

interface PickerTabsProps {
  keyPosition: number;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

const tabs: { id: TabId; label: string }[] = [
  { id: "recommendations", label: "おすすめ" },
  { id: "letters", label: "文字・記号" },
  { id: "actions", label: "操作" },
  { id: "layers", label: "レイヤー" },
  { id: "modifiers", label: "修飾キー" },
  { id: "system", label: "システム" },
];

export function PickerTabs({
  keyPosition,
  behaviors,
  layers,
  onApplyBinding,
}: PickerTabsProps) {
  const hasRecommendations = keyRoleMap[keyPosition] !== undefined;
  const [activeTab, setActiveTab] = useState<TabId>(
    hasRecommendations ? "recommendations" : "letters"
  );

  // Reset tab when key changes
  useEffect(() => {
    setActiveTab(keyRoleMap[keyPosition] !== undefined ? "recommendations" : "letters");
  }, [keyPosition]);

  return (
    <div className="flex flex-col gap-2">
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
      <div className="min-h-[6rem]">
        {activeTab === "recommendations" && (
          <RecommendationsTab
            keyPosition={keyPosition}
            behaviors={behaviors}
            onApplyBinding={onApplyBinding}
          />
        )}
        {activeTab === "letters" && (
          <LettersTab behaviors={behaviors} onApplyBinding={onApplyBinding} />
        )}
        {activeTab === "actions" && (
          <ActionsTab behaviors={behaviors} layers={layers} onApplyBinding={onApplyBinding} />
        )}
        {activeTab === "layers" && (
          <LayersTab behaviors={behaviors} layers={layers} onApplyBinding={onApplyBinding} />
        )}
        {activeTab === "modifiers" && (
          <div className="p-4 text-sm text-base-content/50">修飾キータブ（実装中）</div>
        )}
        {activeTab === "system" && (
          <div className="p-4 text-sm text-base-content/50">システムタブ（実装中）</div>
        )}
      </div>
    </div>
  );
}
