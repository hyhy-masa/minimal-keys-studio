import { useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { LettersTab } from "./LettersTab";
import { ActionsTab } from "./ActionsTab";
import { LayersTab } from "./LayersTab";
import { ModifiersTab } from "./ModifiersTab";
import { SystemTab } from "./SystemTab";

type TabId = "actions" | "letters" | "layers" | "modifiers" | "system";

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
  { id: "system", label: "システム" },
];

export function PickerTabs({
  keyPosition,
  behaviors,
  layers,
  onApplyBinding,
}: PickerTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("actions");

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
        {activeTab === "actions" && (
          <ActionsTab
            keyPosition={keyPosition}
            behaviors={behaviors}
            layers={layers}
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
          <ModifiersTab behaviors={behaviors} layers={layers} onApplyBinding={onApplyBinding} />
        )}
        {activeTab === "system" && (
          <SystemTab behaviors={behaviors} onApplyBinding={onApplyBinding} />
        )}
      </div>
    </div>
  );
}
