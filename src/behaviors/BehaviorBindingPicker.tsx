import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GetBehaviorDetailsResponse,
  BehaviorBindingParametersSet,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { BehaviorParametersPicker } from "./BehaviorParametersPicker";
import { validateValue } from "./parameters";
import { getBehaviorDescription } from "./behavior-descriptions";
import { PickerTabs } from "./picker/PickerTabs";

export interface BehaviorBindingPickerProps {
  binding: BehaviorBinding;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onBindingChanged: (binding: BehaviorBinding) => void;
  keyPosition?: number;
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
  if (!matchingSet) return false;
  return validateValue(layerIds, param2, matchingSet.param2);
}

export const BehaviorBindingPicker = ({
  binding,
  layers,
  behaviors,
  onBindingChanged,
  keyPosition,
}: BehaviorBindingPickerProps) => {
  const [behaviorId, setBehaviorId] = useState(binding.behaviorId);
  const [param1, setParam1] = useState<number | undefined>(binding.param1);
  const [param2, setParam2] = useState<number | undefined>(binding.param2);
  const [showParamPickers, setShowParamPickers] = useState(false);
  // Skip validation when applying directly from recommendations/use-cases
  // or when selecting a behavior for param configuration
  const skipNextValidation = useRef(false);

  const metadata = useMemo(
    () => behaviors.find((b) => b.id == behaviorId)?.metadata,
    [behaviorId, behaviors]
  );

  useEffect(() => {
    if (skipNextValidation.current) {
      skipNextValidation.current = false;
      return;
    }
    if (
      binding.behaviorId === behaviorId &&
      binding.param1 === param1 &&
      binding.param2 === param2
    ) {
      return;
    }
    if (!metadata) return;
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

  // Called by Recommendations/UseCases tabs — apply full binding directly
  const handleApplyBinding = (newBinding: BehaviorBinding) => {
    setShowParamPickers(false);
    skipNextValidation.current = true;
    setBehaviorId(newBinding.behaviorId);
    setParam1(newBinding.param1);
    setParam2(newBinding.param2);
    // Bypass validation — pre-configured data is known-good
    onBindingChanged(newBinding);
  };

  // Called by All tab — select behavior, then show param pickers
  // Don't call onBindingChanged yet — wait for user to set params
  const handleBehaviorSelected = (newBehaviorId: number) => {
    setShowParamPickers(true);
    skipNextValidation.current = true;
    setBehaviorId(newBehaviorId);
    setParam1(0);
    setParam2(0);
  };

  // Current binding display
  const currentBehavior = behaviors.find((b) => b.id === binding.behaviorId);
  const currentDesc = currentBehavior
    ? getBehaviorDescription(currentBehavior.displayName)
    : null;

  return (
    <div className="flex flex-col gap-2">
      {currentDesc && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-base-200 rounded text-sm">
          <span className="text-base-content/50">現在:</span>
          <span className="font-medium">{currentDesc.label}</span>
          {currentDesc.label !== currentBehavior!.displayName && (
            <span className="text-xs text-base-content/40">({currentBehavior!.displayName})</span>
          )}
        </div>
      )}
      <PickerTabs
        keyPosition={keyPosition ?? -1}
        behaviors={behaviors}
        layers={layers}
        selectedBehaviorId={behaviorId}
        onApplyBinding={handleApplyBinding}
        onBehaviorSelected={handleBehaviorSelected}
      />
      {showParamPickers && metadata && (
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
