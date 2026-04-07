import { useEffect, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { keyRoleMap } from "../../keyboard/key-roles";
import { RecommendationsTab } from "./RecommendationsTab";
import { UseCasesTab } from "./UseCasesTab";
import { AllBehaviorsTab } from "./AllBehaviorsTab";

type TabId = "recommendations" | "use-cases" | "all";

interface PickerTabsProps {
  keyPosition: number;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  selectedBehaviorId: number;
  onApplyBinding: (binding: BehaviorBinding) => void;
  onBehaviorSelected: (behaviorId: number) => void;
  // Inline param editing for "自分で選ぶ" tab
  editingParams?: boolean;
  param1?: number;
  param2?: number;
  onParam1Changed?: (value?: number) => void;
  onParam2Changed?: (value?: number) => void;
}

const tabs: { id: TabId; label: string }[] = [
  { id: "recommendations", label: "おすすめ" },
  { id: "use-cases", label: "用途別" },
  { id: "all", label: "自分で選ぶ" },
];

export function PickerTabs({
  keyPosition,
  behaviors,
  layers,
  selectedBehaviorId,
  onApplyBinding,
  onBehaviorSelected,
  editingParams,
  param1,
  param2,
  onParam1Changed,
  onParam2Changed,
}: PickerTabsProps) {
  const hasRecommendations = keyRoleMap[keyPosition] !== undefined;
  const [activeTab, setActiveTab] = useState<TabId>(
    hasRecommendations ? "recommendations" : "use-cases"
  );

  // Reset tab when key changes
  useEffect(() => {
    setActiveTab(keyRoleMap[keyPosition] !== undefined ? "recommendations" : "use-cases");
  }, [keyPosition]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 bg-base-200 p-1 rounded-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${
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
        {activeTab === "use-cases" && (
          <UseCasesTab
            behaviors={behaviors}
            layers={layers}
            onApplyBinding={onApplyBinding}
          />
        )}
        {activeTab === "all" && (
          <AllBehaviorsTab
            key={keyPosition}
            behaviors={behaviors}
            layers={layers}
            selectedBehaviorId={selectedBehaviorId}
            onBehaviorSelected={onBehaviorSelected}
            onApplyBinding={onApplyBinding}
            editingParams={editingParams}
            param1={param1}
            param2={param2}
            onParam1Changed={onParam1Changed}
            onParam2Changed={onParam2Changed}
          />
        )}
      </div>
    </div>
  );
}
