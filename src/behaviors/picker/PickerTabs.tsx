import { useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { useOsMode } from "../../OsModeContext";
import { LettersTab } from "./LettersTab";
import { ActionsTab } from "./ActionsTab";
import { LayersTab } from "./LayersTab";
import { ModifiersTab } from "./ModifiersTab";
import { SystemTab } from "./SystemTab";
import { JapaneseTab } from "./JapaneseTab";

export type PickerTabId = "actions" | "letters" | "layers" | "modifiers" | "japanese" | "system";

interface PickerTabsProps {
  keyPosition: number;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; index: number; name: string }[];
  onApplyBinding: (binding: BehaviorBinding, source: PickerTabId) => void;
  initialTab?: PickerTabId;
}

const tabs: { id: PickerTabId; label: string }[] = [
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
  initialTab = "actions",
}: PickerTabsProps) {
  const { osMode } = useOsMode();
  const [activeTab, setActiveTab] = useState<PickerTabId>(initialTab);
  const applyFromTab = (binding: BehaviorBinding) => onApplyBinding(binding, activeTab);

  return (
    <div className="flex flex-col gap-2">
      {/*
        Tab bar.

        以前は overflow-x-auto で横スクロールにしていたが、幅が足りないと
        「修飾キー」以降がウィンドウの外に隠れ、ウィンドウを広げても戻って
        こなかった（親の箱に min-w-0 が無く、幅の変化がここまで伝わって
        いなかった）。隠れる作りをやめ、狭いときは折り返す。
        タブは6つしかないので、折り返しても2段で収まる。
      */}
      <div className="flex flex-wrap gap-0.5 bg-base-200 p-1 rounded-lg">
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
            onApplyBinding={applyFromTab}
          />
        )}
        {activeTab === "letters" && (
          <LettersTab behaviors={behaviors} onApplyBinding={applyFromTab} />
        )}
        {activeTab === "layers" && (
          <LayersTab behaviors={behaviors} layers={layers} onApplyBinding={applyFromTab} />
        )}
        {activeTab === "modifiers" && (
          <ModifiersTab behaviors={behaviors} layers={layers} osMode={osMode} onApplyBinding={applyFromTab} />
        )}
        {activeTab === "japanese" && (
          <JapaneseTab behaviors={behaviors} osMode={osMode} onApplyBinding={applyFromTab} />
        )}
        {activeTab === "system" && (
          <SystemTab behaviors={behaviors} onApplyBinding={applyFromTab} />
        )}
      </div>
    </div>
  );
}
