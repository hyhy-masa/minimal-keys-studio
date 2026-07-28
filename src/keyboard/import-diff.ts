import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

export interface ImportLayer {
  name: string;
  bindings: BehaviorBinding[];
}

interface CurrentLayer {
  id: number;
  name: string;
  bindings: BehaviorBinding[];
}

export interface LayerPropsChange {
  layerId: number;
  name: string;
}

export interface BindingChange {
  layerId: number;
  keyPosition: number;
  binding: BehaviorBinding;
}

export interface ImportChanges {
  layerProps: LayerPropsChange[];
  bindings: BindingChange[];
}

export function calculateUnappliedLayerCount(
  currentLayerCount: number,
  importedLayerCount: number,
): number {
  return Math.max(0, importedLayerCount - currentLayerCount);
}

function normalizedBindingValue(value: unknown): number | undefined {
  if (value === undefined) return 0;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bindingsMatch(
  current: BehaviorBinding | undefined,
  imported: BehaviorBinding,
): boolean {
  if (!current) return false;

  const currentValues = [current.behaviorId, current.param1, current.param2];
  const importedValues = [imported.behaviorId, imported.param1, imported.param2];
  return currentValues.every((value, index) => {
    const currentValue = normalizedBindingValue(value);
    const importedValue = normalizedBindingValue(importedValues[index]);
    return currentValue !== undefined && importedValue !== undefined && currentValue === importedValue;
  });
}

export function calculateImportChanges(
  currentKeymap: { layers: CurrentLayer[] },
  importedLayers: ImportLayer[],
): ImportChanges {
  const layerProps: LayerPropsChange[] = [];
  const bindings: BindingChange[] = [];

  for (let layerIndex = 0; layerIndex < importedLayers.length; layerIndex++) {
    const currentLayer = currentKeymap.layers[layerIndex];
    const importedLayer = importedLayers[layerIndex];
    if (!currentLayer) continue;

    if (importedLayer.name !== currentLayer.name) {
      layerProps.push({ layerId: currentLayer.id, name: importedLayer.name });
    }

    for (let keyPosition = 0; keyPosition < importedLayer.bindings.length; keyPosition++) {
      const importedBinding = importedLayer.bindings[keyPosition];
      if (!bindingsMatch(currentLayer.bindings[keyPosition], importedBinding)) {
        bindings.push({ layerId: currentLayer.id, keyPosition, binding: importedBinding });
      }
    }
  }

  return { layerProps, bindings };
}
