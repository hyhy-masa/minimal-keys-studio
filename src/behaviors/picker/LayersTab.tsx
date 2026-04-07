import { useMemo, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { hid_usage_from_page_and_id } from "../../hid-usages";
import { getBehaviorDescription } from "../behavior-descriptions";

const KB = 7;

// Common keys for Layer-Tap param2 selection
const commonTapKeys = [
  { label: "Space", hidId: 44 },
  { label: "Enter", hidId: 40 },
  { label: "Tab", hidId: 43 },
  { label: "Esc", hidId: 41 },
  { label: "BS", hidId: 42 },
  { label: "Delete", hidId: 76 },
  ...Array.from({ length: 26 }, (_, i) => ({
    label: String.fromCharCode(65 + i),
    hidId: 4 + i,
  })),
];

const layerBehaviorNames = [
  "Momentary Layer",
  "Toggle Layer",
  "Layer-Tap",
  "Sticky Layer",
  "To Layer",
];

interface LayersTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function LayersTab({ behaviors, layers, onApplyBinding }: LayersTabProps) {
  const [selectedBehavior, setSelectedBehavior] = useState<string | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);
  const [selectedTapKey, setSelectedTapKey] = useState<number | null>(null);

  const availableBehaviors = useMemo(
    () => behaviors.filter((b) => layerBehaviorNames.includes(b.displayName)),
    [behaviors],
  );

  const behaviorIdMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of availableBehaviors) {
      map[b.displayName] = b.id;
    }
    return map;
  }, [availableBehaviors]);

  const is2Param = selectedBehavior === "Layer-Tap";

  const handleBehaviorClick = (displayName: string) => {
    setSelectedBehavior(displayName);
    setSelectedLayer(null);
    setSelectedTapKey(null);
  };

  const handleLayerClick = (layerId: number) => {
    setSelectedLayer(layerId);
    if (!is2Param && selectedBehavior) {
      // 1-param behavior: apply immediately
      const behaviorId = behaviorIdMap[selectedBehavior];
      if (behaviorId !== undefined) {
        onApplyBinding({ behaviorId, param1: layerId, param2: 0 });
      }
    }
  };

  const handleTapKeyClick = (hidId: number) => {
    setSelectedTapKey(hidId);
  };

  const handleApply = () => {
    if (!selectedBehavior || selectedLayer === null) return;
    const behaviorId = behaviorIdMap[selectedBehavior];
    if (behaviorId === undefined) return;
    if (is2Param && selectedTapKey === null) return;
    onApplyBinding({
      behaviorId,
      param1: selectedLayer,
      param2: is2Param ? hid_usage_from_page_and_id(KB, selectedTapKey!) : 0,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Step 1: Choose behavior type */}
      <div>
        <div className="text-sm text-base-content/60 mb-1">レイヤー機能を選択</div>
        <div className="flex flex-wrap gap-1">
          {availableBehaviors.map((b) => {
            const desc = getBehaviorDescription(b.displayName);
            return (
              <button
                key={b.id}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  selectedBehavior === b.displayName
                    ? "bg-primary/10 text-primary border-primary/30 font-medium"
                    : "border-base-300 bg-white hover:bg-base-200 text-base-content"
                }`}
                onClick={() => handleBehaviorClick(b.displayName)}
              >
                {desc.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Choose layer */}
      {selectedBehavior && (
        <div>
          <div className="text-sm text-base-content/60 mb-1">レイヤーを選択</div>
          <div className="flex flex-wrap gap-1">
            {layers.map((layer) => (
              <button
                key={layer.id}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  selectedLayer === layer.id
                    ? "bg-primary/10 text-primary border-primary/30 font-medium"
                    : "border-base-300 bg-white hover:bg-base-200 text-base-content"
                }`}
                onClick={() => handleLayerClick(layer.id)}
              >
                {layer.name || `Layer ${layer.id}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: For Layer-Tap, choose tap key */}
      {is2Param && selectedLayer !== null && (
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

      {/* Apply button for 2-param behaviors */}
      {is2Param && (
        <button
          className="self-start px-4 py-2 text-sm rounded-md bg-primary text-primary-content font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={selectedLayer === null || selectedTapKey === null}
          onClick={handleApply}
        >
          適用する
        </button>
      )}
    </div>
  );
}
