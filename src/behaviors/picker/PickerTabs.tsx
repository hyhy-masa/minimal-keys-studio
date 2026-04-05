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
}

const tabs: { id: TabId; label: string }[] = [
  { id: "recommendations", label: "おすすめ" },
  { id: "use-cases", label: "用途別" },
  { id: "all", label: "すべて" },
];

export function PickerTabs({
  keyPosition,
  behaviors,
  layers,
  selectedBehaviorId,
  onApplyBinding,
  onBehaviorSelected,
}: PickerTabsProps) {
  const hasRecommendations = keyRoleMap[keyPosition] !== undefined;
  const [activeTab, setActiveTab] = useState<TabId>(
    hasRecommendations ? "recommendations" : "use-cases"
  );

  // Reset tab when key changes
  useEffect(() => {
    setActiveTab(keyRoleMap[keyPosition] ? "recommendations" : "use-cases");
  }, [keyPosition]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 border-b border-base-300 pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`px-3 py-1 text-sm rounded-t transition-all ${
              activeTab === tab.id
                ? "bg-base-100 text-primary font-medium border-b-2 border-primary"
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
            onApplyBinding={onApplyBinding}
          />
        )}
        {activeTab === "all" && (
          <AllBehaviorsTab
            behaviors={behaviors}
            layers={layers}
            selectedBehaviorId={selectedBehaviorId}
            onBehaviorSelected={onBehaviorSelected}
          />
        )}
      </div>
    </div>
  );
}
