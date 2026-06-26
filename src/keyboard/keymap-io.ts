import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

export interface ExportBinding {
  behaviorName: string;
  param1: number;
  param2: number;
}

export interface ExportLayer {
  name: string;
  bindings: ExportBinding[];
}

export interface KeymapExportFile {
  format: "minimal-keys-studio-keymap";
  version: 1;
  exportDate: string;
  appVersion: string;
  keymap: {
    layers: ExportLayer[];
  };
}

interface RuntimeLayer {
  id: number;
  name: string;
  bindings: BehaviorBinding[];
}

interface RuntimeKeymap {
  layers: RuntimeLayer[];
  availableLayers: number;
  maxLayerNameLength: number;
}

export type ImportError =
  | { type: "parse"; message: string }
  | { type: "format"; message: string }
  | { type: "structure"; message: string }
  | { type: "behavior"; names: string[] }
  | { type: "layerCount"; requested: number; max: number }
  | { type: "bindingCount"; layer: number; expected: number; actual: number }
  | { type: "layerIndex"; layer: number; keyPosition: number; index: number; layerCount: number };

export type ImportResult =
  | { ok: true; layers: { name: string; bindings: BehaviorBinding[] }[] }
  | { ok: false; error: ImportError };

const LAYER_BEHAVIOR_NAMES = [
  "Momentary Layer",
  "Toggle Layer",
  "Layer-Tap",
  "Sticky Layer",
  "To Layer",
  "Conditional Layer",
];

export function serializeKeymap(
  keymap: RuntimeKeymap,
  behaviors: GetBehaviorDetailsResponse[],
  appVersion: string,
): KeymapExportFile {
  const behaviorIdToName = new Map<number, string>();
  for (const b of behaviors) {
    behaviorIdToName.set(b.id, b.displayName);
  }

  return {
    format: "minimal-keys-studio-keymap",
    version: 1,
    exportDate: new Date().toISOString(),
    appVersion,
    keymap: {
      layers: keymap.layers.map((layer) => ({
        name: layer.name,
        bindings: layer.bindings.map((b) => ({
          behaviorName: behaviorIdToName.get(b.behaviorId) ?? `Unknown(${b.behaviorId})`,
          param1: b.param1,
          param2: b.param2,
        })),
      })),
    },
  };
}

export function deserializeKeymap(
  json: string,
  deviceBehaviors: GetBehaviorDetailsResponse[],
  deviceKeyCount: number,
  maxLayers: number,
): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: { type: "parse", message: "JSONの形式が正しくありません" } };
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("format" in data) ||
    !("version" in data) ||
    !("keymap" in data)
  ) {
    return { ok: false, error: { type: "format", message: "キーマップファイルの形式が不正です" } };
  }

  const file = data as Record<string, unknown>;
  if (file.format !== "minimal-keys-studio-keymap" || file.version !== 1) {
    return { ok: false, error: { type: "format", message: "対応していないファイル形式またはバージョンです" } };
  }

  const km = file.keymap as Record<string, unknown> | undefined;
  if (!km || !Array.isArray(km.layers)) {
    return { ok: false, error: { type: "structure", message: "keymapまたはlayersが見つかりません" } };
  }

  const exportLayers = km.layers as unknown[];

  if (exportLayers.length > maxLayers) {
    return {
      ok: false,
      error: { type: "layerCount", requested: exportLayers.length, max: maxLayers },
    };
  }

  const nameToId = new Map<string, number>();
  for (const b of deviceBehaviors) {
    nameToId.set(b.displayName, b.id);
  }

  const unknownBehaviors: string[] = [];
  const resolvedLayers: { name: string; bindings: BehaviorBinding[] }[] = [];

  for (let li = 0; li < exportLayers.length; li++) {
    const layer = exportLayers[li] as Record<string, unknown>;
    if (typeof layer.name !== "string" || !Array.isArray(layer.bindings)) {
      return {
        ok: false,
        error: { type: "structure", message: `Layer ${li} の構造が不正です` },
      };
    }

    const bindings = layer.bindings as unknown[];
    if (bindings.length !== deviceKeyCount) {
      return {
        ok: false,
        error: {
          type: "bindingCount",
          layer: li,
          expected: deviceKeyCount,
          actual: bindings.length,
        },
      };
    }

    const resolvedBindings: BehaviorBinding[] = [];
    for (let ki = 0; ki < bindings.length; ki++) {
      const b = bindings[ki] as Record<string, unknown>;
      if (
        typeof b.behaviorName !== "string" ||
        typeof b.param1 !== "number" ||
        typeof b.param2 !== "number"
      ) {
        return {
          ok: false,
          error: { type: "structure", message: `Layer ${li}, Key ${ki} の構造が不正です` },
        };
      }

      const behaviorId = nameToId.get(b.behaviorName);
      if (behaviorId === undefined) {
        if (!unknownBehaviors.includes(b.behaviorName)) {
          unknownBehaviors.push(b.behaviorName);
        }
        continue;
      }

      if (LAYER_BEHAVIOR_NAMES.includes(b.behaviorName) && b.param1 >= exportLayers.length) {
        return {
          ok: false,
          error: {
            type: "layerIndex",
            layer: li,
            keyPosition: ki,
            index: b.param1,
            layerCount: exportLayers.length,
          },
        };
      }

      resolvedBindings.push({ behaviorId, param1: b.param1, param2: b.param2 });
    }

    resolvedLayers.push({ name: layer.name as string, bindings: resolvedBindings });
  }

  if (unknownBehaviors.length > 0) {
    return { ok: false, error: { type: "behavior", names: unknownBehaviors } };
  }

  return { ok: true, layers: resolvedLayers };
}

export async function downloadJson(data: object, filename: string): Promise<boolean> {
  const json = JSON.stringify(data, null, 2);

  if (window.__TAURI_INTERNALS__) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: filename,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return false;
    await writeTextFile(path, json);
    return true;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function openFilePicker(): Promise<string> {
  if (window.__TAURI_INTERNALS__) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
      directory: false,
    });
    if (!path) throw new Error("ファイルが選択されませんでした");
    return readTextFile(path as string);
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("ファイルが選択されませんでした"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}
