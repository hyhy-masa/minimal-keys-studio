import { useMemo, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import {
  getBehaviorDescription,
  categoryLabels,
  categoryOrder,
  BehaviorCategory,
} from "../behavior-descriptions";
import { BehaviorParametersPicker } from "../BehaviorParametersPicker";

interface AllBehaviorsTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  selectedBehaviorId: number;
  onBehaviorSelected: (behaviorId: number) => void;
  // Inline param editing
  editingParams?: boolean;
  param1?: number;
  param2?: number;
  onParam1Changed?: (value?: number) => void;
  onParam2Changed?: (value?: number) => void;
}

export function AllBehaviorsTab({
  behaviors,
  layers,
  selectedBehaviorId,
  onBehaviorSelected,
  editingParams,
  param1,
  param2,
  onParam1Changed,
  onParam2Changed,
}: AllBehaviorsTabProps) {
  const [expandedCategory, setExpandedCategory] =
    useState<BehaviorCategory | null>("basic");

  const groupedBehaviors = useMemo(() => {
    const groups = new Map<BehaviorCategory, GetBehaviorDetailsResponse[]>();
    for (const cat of categoryOrder) groups.set(cat, []);
    for (const b of behaviors) {
      const desc = getBehaviorDescription(b.displayName);
      const list = groups.get(desc.category);
      if (list) list.push(b);
      else groups.get("other")!.push(b);
    }
    for (const [, list] of groups) {
      list.sort((a, b) => {
        const da = getBehaviorDescription(a.displayName);
        const db = getBehaviorDescription(b.displayName);
        return da.label.localeCompare(db.label);
      });
    }
    return groups;
  }, [behaviors]);

  const selectedMetadata = useMemo(
    () => behaviors.find((b) => b.id === selectedBehaviorId)?.metadata,
    [behaviors, selectedBehaviorId]
  );

  return (
    <div className="flex flex-col gap-1">
      {categoryOrder.map((cat) => {
        const list = groupedBehaviors.get(cat);
        if (!list || list.length === 0) return null;
        const isExpanded = expandedCategory === cat;
        return (
          <div key={cat}>
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-base-content/70 hover:bg-base-200 rounded"
              onClick={() => setExpandedCategory(isExpanded ? null : cat)}
            >
              <span className="text-sm">{isExpanded ? "▼" : "▶"}</span>
              {categoryLabels[cat]}
              <span className="text-sm text-base-content/40 ml-auto">
                {list.length}
              </span>
            </button>
            {isExpanded && (
              <div className="flex flex-col ml-4">
                {list.map((b) => {
                  const desc = getBehaviorDescription(b.displayName);
                  const isSelected = b.id === selectedBehaviorId;
                  return (
                    <div key={b.id}>
                      <button
                        className={`w-full text-left px-2 py-1 rounded text-sm hover:bg-base-200 ${
                          isSelected ? "bg-primary/10 text-primary font-medium" : ""
                        }`}
                        onClick={() => onBehaviorSelected(b.id)}
                      >
                        <span>{desc.label}</span>
                        {desc.label !== b.displayName && (
                          <span className="text-sm text-base-content/40 ml-1">
                            ({b.displayName})
                          </span>
                        )}
                        {desc.description && (
                          <p className="text-sm text-base-content/50 leading-relaxed">
                            {desc.description}
                          </p>
                        )}
                      </button>
                      {/* Inline param picker — directly below selected behavior */}
                      {isSelected && editingParams && selectedMetadata && onParam1Changed && onParam2Changed && (
                        <div className="ml-2 mt-1 mb-2 p-2 border border-base-300 rounded-lg bg-base-100">
                          <BehaviorParametersPicker
                            metadata={selectedMetadata}
                            param1={param1}
                            param2={param2}
                            layers={layers}
                            onParam1Changed={onParam1Changed}
                            onParam2Changed={onParam2Changed}
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
      })}
    </div>
  );
}
