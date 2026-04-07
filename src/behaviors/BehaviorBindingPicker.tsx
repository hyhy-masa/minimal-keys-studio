import { useCallback, useRef } from "react";
import type {
  GetBehaviorDetailsResponse,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { getBehaviorDescription } from "./behavior-descriptions";
import { formatBindingDetail } from "./binding-display";
import { PickerTabs } from "./picker/PickerTabs";

export interface BehaviorBindingPickerProps {
  binding: BehaviorBinding;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onBindingChanged: (binding: BehaviorBinding) => void;
  keyPosition?: number;
}

export const BehaviorBindingPicker = ({
  binding,
  layers,
  behaviors,
  onBindingChanged,
  keyPosition,
}: BehaviorBindingPickerProps) => {
  // Stable ref to avoid re-renders in child tabs
  const onBindingChangedRef = useRef(onBindingChanged);
  onBindingChangedRef.current = onBindingChanged;

  // All tabs call this directly with a complete binding
  const handleApplyBinding = useCallback((newBinding: BehaviorBinding) => {
    onBindingChangedRef.current(newBinding);
  }, []);

  // Current binding display
  const currentBehavior = behaviors.find((b) => b.id === binding.behaviorId);
  const currentDesc = currentBehavior
    ? getBehaviorDescription(currentBehavior.displayName)
    : null;
  const bindingDetail = currentBehavior
    ? formatBindingDetail(currentBehavior.displayName, binding, layers)
    : "";

  return (
    <div className="flex flex-col gap-2">
      {currentBehavior && currentDesc && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-primary/50 bg-primary/5 text-sm">
          <span className="text-primary font-medium">現在の設定:</span>
          <span className="font-bold">{currentDesc.label}</span>
          {bindingDetail && (
            <span className="text-base-content/70">→ {bindingDetail}</span>
          )}
        </div>
      )}
      <PickerTabs
        keyPosition={keyPosition ?? -1}
        behaviors={behaviors}
        layers={layers}
        onApplyBinding={handleApplyBinding}
      />
    </div>
  );
};
