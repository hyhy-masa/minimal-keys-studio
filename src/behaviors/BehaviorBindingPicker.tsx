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
  modifierFlags?: number;
}

function applyModifierFlags(
  binding: BehaviorBinding,
  modFlags: number,
  behaviors: GetBehaviorDetailsResponse[]
): BehaviorBinding {
  if (modFlags === 0) return binding;
  const behavior = behaviors.find((b) => b.id === binding.behaviorId);
  if (behavior?.displayName !== "Key Press") return binding;
  const existingMods = (binding.param1 >> 24) & 0xff;
  const newMods = existingMods | modFlags;
  return { ...binding, param1: (newMods << 24) | (binding.param1 & 0x00ffffff) };
}

export const BehaviorBindingPicker = ({
  binding,
  layers,
  behaviors,
  onBindingChanged,
  keyPosition,
  modifierFlags = 0,
}: BehaviorBindingPickerProps) => {
  const onBindingChangedRef = useRef(onBindingChanged);
  onBindingChangedRef.current = onBindingChanged;

  const behaviorsRef = useRef(behaviors);
  behaviorsRef.current = behaviors;

  const modFlagsRef = useRef(modifierFlags);
  modFlagsRef.current = modifierFlags;

  const handleApplyBinding = useCallback((newBinding: BehaviorBinding) => {
    const applied = applyModifierFlags(newBinding, modFlagsRef.current, behaviorsRef.current);
    onBindingChangedRef.current(applied);
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
