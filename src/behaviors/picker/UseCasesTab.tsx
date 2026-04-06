import { useMemo, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { getUseCaseCategories, detectOS } from "../use-cases";
import { resolveBehaviorId } from "../resolve-behavior";
import { BehaviorParametersPicker } from "../BehaviorParametersPicker";

interface UseCasesTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function UseCasesTab({ behaviors, layers, onApplyBinding }: UseCasesTabProps) {
  const os = detectOS();
  const categories = getUseCaseCategories(os);
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id);
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  // Inline param editing for needsParams items
  const [editingBehaviorId, setEditingBehaviorId] = useState<number | null>(null);
  const [param1, setParam1] = useState<number | undefined>(0);
  const [param2, setParam2] = useState<number | undefined>(0);

  const editingMetadata = useMemo(
    () => editingBehaviorId !== null
      ? behaviors.find((b) => b.id === editingBehaviorId)?.metadata
      : undefined,
    [behaviors, editingBehaviorId]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-base-content/40 px-1">{os === "mac" ? "Mac" : "Windows"}</span>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`px-3 py-1 text-sm rounded-md transition-all ${
              selectedCategoryId === cat.id
                ? "bg-primary text-primary-content"
                : "bg-base-200 hover:bg-base-300"
            }`}
            onClick={() => {
              setSelectedCategoryId(cat.id);
              setEditingBehaviorId(null);
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>
      {selectedCategory && (
        <div className="flex flex-col gap-0.5">
          {selectedCategory.items.map((item) => {
            const behaviorId = resolveBehaviorId(item.behaviorDisplayName, behaviors);
            if (behaviorId === undefined) return null;
            const isEditing = item.needsParams && editingBehaviorId === behaviorId;
            return (
              <div key={`${item.behaviorDisplayName}-${item.param1}-${item.label}`}>
                <button
                  className={`w-full text-left px-3 py-2 rounded hover:bg-base-200 transition-colors ${
                    isEditing ? "bg-primary/10 text-primary" : ""
                  }`}
                  onClick={() => {
                    if (item.needsParams) {
                      if (isEditing) {
                        setEditingBehaviorId(null);
                      } else {
                        setEditingBehaviorId(behaviorId);
                        setParam1(0);
                        setParam2(0);
                      }
                    } else {
                      onApplyBinding({
                        behaviorId,
                        param1: item.param1,
                        param2: item.param2,
                      });
                    }
                  }}
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.needsParams && (
                    <span className="text-sm text-primary ml-1">{isEditing ? "▼ 設定中" : "▶ クリックして設定"}</span>
                  )}
                  <p className="text-sm text-base-content/50">{item.description}</p>
                </button>
                {isEditing && editingMetadata && (
                  <div className="ml-3 mt-1 mb-2 p-2 border border-base-300 rounded-lg bg-base-100">
                    <BehaviorParametersPicker
                      metadata={editingMetadata}
                      param1={param1}
                      param2={param2}
                      layers={layers}
                      onParam1Changed={(v) => {
                        setParam1(v);
                        onApplyBinding({ behaviorId, param1: v ?? 0, param2: param2 ?? 0 });
                      }}
                      onParam2Changed={(v) => {
                        setParam2(v);
                        onApplyBinding({ behaviorId, param1: param1 ?? 0, param2: v ?? 0 });
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
