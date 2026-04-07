import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GetBehaviorDetailsResponse,
  BehaviorBindingParametersSet,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { validateValue } from "./parameters";
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
  // "All" tab: user is manually editing params via param pickers
  const [editingParams, setEditingParams] = useState(false);
  // Ref for immediate cross-effect communication (state updates are async)
  const editingParamsRef = useRef(false);

  // Stable ref to avoid effect dependency on callback
  const onBindingChangedRef = useRef(onBindingChanged);
  onBindingChangedRef.current = onBindingChanged;

  const metadata = useMemo(
    () => behaviors.find((b) => b.id == behaviorId)?.metadata,
    [behaviorId, behaviors]
  );

  // Reset editing state when a different key is selected
  useEffect(() => {
    editingParamsRef.current = false;
    setEditingParams(false);
    setBehaviorId(binding.behaviorId);
    setParam1(binding.param1);
    setParam2(binding.param2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyPosition]);

  // Sync binding prop → local state (when key changes or parent updates binding)
  // Only resets editing state on EXTERNAL changes (binding prop changed by parent).
  // When editingParamsRef is true and behaviorId matches what user selected,
  // we keep editing active (user is still adjusting params).
  useEffect(() => {
    if (editingParamsRef.current) {
      // User is editing — check if this is an echo of our own change or external
      if (
        binding.behaviorId === behaviorId &&
        binding.param1 === param1 &&
        binding.param2 === param2
      ) {
        return; // Echo of our change — skip
      }
      // If behavior matches what user selected, keep editing
      // (binding prop hasn't caught up yet, or params are still being adjusted)
      if (binding.behaviorId !== behaviorId) {
        // Only reset if the BEHAVIOR changed externally (e.g., different key selected)
        // Don't reset if user just selected a new behavior in the picker
        return;
      }
      return; // Keep editing active for param changes
    }
    // Not editing — sync from parent
    setBehaviorId(binding.behaviorId);
    setParam1(binding.param1);
    setParam2(binding.param2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding.behaviorId, binding.param1, binding.param2]);

  // Auto-apply: ONLY when user is editing params via "All" tab
  useEffect(() => {
    // Use ref (not state) — ref is set synchronously by sync effect above
    if (!editingParamsRef.current) return;
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
      onBindingChangedRef.current({
        behaviorId,
        param1: param1 ?? 0,
        param2: param2 ?? 0,
      });
    }
  }, [behaviorId, param1, param2, binding.behaviorId, binding.param1, binding.param2, layers, metadata]);

  // Called by Recommendations/UseCases tabs — apply full binding directly
  const handleApplyBinding = useCallback((newBinding: BehaviorBinding) => {
    editingParamsRef.current = false;
    setEditingParams(false);
    onBindingChangedRef.current(newBinding);
  }, []);

  // Called by All tab — select behavior, then show param pickers
  const handleBehaviorSelected = useCallback((newBehaviorId: number) => {
    editingParamsRef.current = true;
    setEditingParams(true);
    setBehaviorId(newBehaviorId);
    setParam1(0);
    setParam2(0);
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
        selectedBehaviorId={behaviorId}
        onApplyBinding={handleApplyBinding}
        onBehaviorSelected={handleBehaviorSelected}
        editingParams={editingParams}
        param1={param1}
        param2={param2}
        onParam1Changed={setParam1}
        onParam2Changed={setParam2}
      />
    </div>
  );
};
