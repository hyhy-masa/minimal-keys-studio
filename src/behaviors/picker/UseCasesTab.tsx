import { useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { useCaseCategories } from "../use-cases";
import { resolveBehaviorId } from "../resolve-behavior";

interface UseCasesTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function UseCasesTab({ behaviors, onApplyBinding }: UseCasesTabProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(useCaseCategories[0]?.id);
  const selectedCategory = useCaseCategories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 flex-wrap">
        {useCaseCategories.map((cat) => (
          <button
            key={cat.id}
            className={`px-3 py-1 text-sm rounded-md transition-all ${
              selectedCategoryId === cat.id
                ? "bg-primary text-primary-content"
                : "bg-base-200 hover:bg-base-300"
            }`}
            onClick={() => setSelectedCategoryId(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>
      {selectedCategory && (
        <div className="flex flex-col gap-0.5">
          {selectedCategory.items.map((item, i) => {
            const behaviorId = resolveBehaviorId(item.behaviorDisplayName, behaviors);
            if (behaviorId === undefined) return null;
            return (
              <button
                key={i}
                className="text-left px-3 py-2 rounded hover:bg-base-200 transition-colors"
                onClick={() =>
                  onApplyBinding({
                    behaviorId,
                    param1: item.param1,
                    param2: item.param2,
                  })
                }
              >
                <span className="text-sm font-medium">{item.label}</span>
                <p className="text-xs text-base-content/50">{item.description}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
