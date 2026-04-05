import { useMemo, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import {
  getBehaviorDescription,
  categoryLabels,
  categoryOrder,
  BehaviorCategory,
} from "../behavior-descriptions";

interface AllBehaviorsTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  selectedBehaviorId: number;
  onBehaviorSelected: (behaviorId: number) => void;
}

export function AllBehaviorsTab({
  behaviors,
  selectedBehaviorId,
  onBehaviorSelected,
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
              <span className="text-xs">{isExpanded ? "▼" : "▶"}</span>
              {categoryLabels[cat]}
              <span className="text-xs text-base-content/40 ml-auto">
                {list.length}
              </span>
            </button>
            {isExpanded && (
              <div className="flex flex-col ml-4">
                {list.map((b) => {
                  const desc = getBehaviorDescription(b.displayName);
                  const isSelected = b.id === selectedBehaviorId;
                  return (
                    <button
                      key={b.id}
                      className={`text-left px-2 py-1 rounded text-sm hover:bg-base-200 ${
                        isSelected ? "bg-primary/10 text-primary font-medium" : ""
                      }`}
                      onClick={() => onBehaviorSelected(b.id)}
                    >
                      <span>{desc.label}</span>
                      {desc.label !== b.displayName && (
                        <span className="text-xs text-base-content/40 ml-1">
                          ({b.displayName})
                        </span>
                      )}
                      {desc.description && (
                        <p className="text-xs text-base-content/50 leading-relaxed">
                          {desc.description}
                        </p>
                      )}
                    </button>
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
