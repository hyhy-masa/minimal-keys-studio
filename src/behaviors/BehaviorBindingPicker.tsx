import { useEffect, useMemo, useState } from "react";

import {
  GetBehaviorDetailsResponse,
  BehaviorBindingParametersSet,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { BehaviorParametersPicker } from "./BehaviorParametersPicker";
import { validateValue } from "./parameters";
import {
  getBehaviorDescription,
  categoryLabels,
  categoryOrder,
  BehaviorCategory,
} from "./behavior-descriptions";

export interface BehaviorBindingPickerProps {
  binding: BehaviorBinding;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onBindingChanged: (binding: BehaviorBinding) => void;
}

function validateBinding(
  metadata: BehaviorBindingParametersSet[],
  layerIds: number[],
  param1?: number,
  param2?: number
): boolean {
  if (
    (param1 === undefined || param1 === 0) &&
    metadata.every((s) => !s.param1 || s.param1.length === 0)
  ) {
    return true;
  }

  const matchingSet = metadata.find((s) =>
    validateValue(layerIds, param1, s.param1)
  );

  if (!matchingSet) {
    return false;
  }

  return validateValue(layerIds, param2, matchingSet.param2);
}

export const BehaviorBindingPicker = ({
  binding,
  layers,
  behaviors,
  onBindingChanged,
}: BehaviorBindingPickerProps) => {
  const [behaviorId, setBehaviorId] = useState(binding.behaviorId);
  const [param1, setParam1] = useState<number | undefined>(binding.param1);
  const [param2, setParam2] = useState<number | undefined>(binding.param2);

  const metadata = useMemo(
    () => behaviors.find((b) => b.id == behaviorId)?.metadata,
    [behaviorId, behaviors]
  );

  const groupedBehaviors = useMemo(() => {
    const groups = new Map<
      BehaviorCategory,
      GetBehaviorDetailsResponse[]
    >();

    for (const cat of categoryOrder) {
      groups.set(cat, []);
    }

    for (const b of behaviors) {
      const desc = getBehaviorDescription(b.displayName);
      const list = groups.get(desc.category);
      if (list) {
        list.push(b);
      } else {
        groups.get("other")!.push(b);
      }
    }

    // Sort within each group by label
    for (const [, list] of groups) {
      list.sort((a, b) => {
        const descA = getBehaviorDescription(a.displayName);
        const descB = getBehaviorDescription(b.displayName);
        return descA.label.localeCompare(descB.label);
      });
    }

    return groups;
  }, [behaviors]);

  const selectedDescription = useMemo(() => {
    const selected = behaviors.find((b) => b.id === behaviorId);
    if (!selected) return null;
    return getBehaviorDescription(selected.displayName);
  }, [behaviorId, behaviors]);

  useEffect(() => {
    if (
      binding.behaviorId === behaviorId &&
      binding.param1 === param1 &&
      binding.param2 === param2
    ) {
      return;
    }

    if (!metadata) {
      console.error(
        "Can't find metadata for the selected behaviorId",
        behaviorId
      );
      return;
    }

    if (
      validateBinding(
        metadata,
        layers.map(({ id }) => id),
        param1,
        param2
      )
    ) {
      onBindingChanged({
        behaviorId,
        param1: param1 || 0,
        param2: param2 || 0,
      });
    }
  }, [behaviorId, param1, param2, binding.behaviorId, binding.param1, binding.param2, layers, metadata, onBindingChanged]);

  useEffect(() => {
    setBehaviorId(binding.behaviorId);
    setParam1(binding.param1);
    setParam2(binding.param2);
  }, [binding]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">機能:</label>
        <select
          value={behaviorId}
          className="h-8 rounded px-2"
          onChange={(e) => {
            setBehaviorId(parseInt(e.target.value));
            setParam1(0);
            setParam2(0);
          }}
        >
          {categoryOrder.map((cat) => {
            const list = groupedBehaviors.get(cat);
            if (!list || list.length === 0) return null;
            return (
              <optgroup key={cat} label={categoryLabels[cat]}>
                {list.map((b) => {
                  const desc = getBehaviorDescription(b.displayName);
                  return (
                    <option key={b.id} value={b.id}>
                      {desc.label}
                      {desc.label !== b.displayName
                        ? ` (${b.displayName})`
                        : ""}
                    </option>
                  );
                })}
              </optgroup>
            );
          })}
        </select>
        {selectedDescription?.description && (
          <p className="text-sm text-base-content/60 mt-0.5 leading-relaxed">
            {selectedDescription.description}
          </p>
        )}
      </div>
      {metadata && (
        <BehaviorParametersPicker
          metadata={metadata}
          param1={param1}
          param2={param2}
          layers={layers}
          onParam1Changed={setParam1}
          onParam2Changed={setParam2}
        />
      )}
    </div>
  );
};
