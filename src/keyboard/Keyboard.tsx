import React, {
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { call_rpc } from "../rpc/logging";
import {
  PhysicalLayout,
  Keymap,
  SetLayerBindingResponse,
  SetLayerPropsResponse,
  BehaviorBinding,
  Layer,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { LayerPicker } from "./LayerPicker";
import { PhysicalLayoutPicker } from "./PhysicalLayoutPicker";
import { Keymap as KeymapComp } from "./Keymap";
import { useConnectedDeviceData } from "../rpc/useConnectedDeviceData";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { UndoRedoContext } from "../undoRedo";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { useBehaviorMap, useBehaviorsLoading } from "../behaviors/BehaviorsContext";
import { produce } from "immer";
import { useToast } from "../misc/Toast";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { useEncoderBindings } from "./useEncoderBindings";
import { computeOneU, DEFAULT_ONE_U } from "./compute-one-u";
import { LoadingSpinner } from "../misc/LoadingSkeleton";
import { useTelemetry } from "../telemetry/TelemetryProvider";
import { useSub } from "../usePubSub";

// Keeps loading state visible for at least minMs so users always see feedback.
function useMinLoadingTime(isLoading: boolean, minMs = 500): boolean {
  const [show, setShow] = useState(isLoading);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      startRef.current = Date.now();
      setShow(true);
    } else if (startRef.current !== null) {
      const remaining = minMs - (Date.now() - startRef.current);
      if (remaining > 0) {
        const timer = setTimeout(() => {
          setShow(false);
          startRef.current = null;
        }, remaining);
        return () => clearTimeout(timer);
      }
      setShow(false);
      startRef.current = null;
    }
  }, [isLoading, minMs]);

  return show;
}

// Separate component for keyboard area — measures container and computes oneU.
// Isolated so ResizeObserver doesn't cause feedback loops with the keyboard rendering.
function KeyboardArea({
  layouts, keymap, behaviors, selectedPhysicalLayoutIndex,
  selectedLayerIndex, selectedKeyPosition, onKeyPositionClicked,
  onBindingApply, encoderRotationLabel, showLoading,
}: {
  layouts: PhysicalLayout[] | undefined;
  keymap: Keymap | undefined;
  behaviors: Record<number, import("@zmkfirmware/zmk-studio-ts-client/behaviors").GetBehaviorDetailsResponse> | undefined;
  selectedPhysicalLayoutIndex: number;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  onKeyPositionClicked: (pos: number) => void;
  onBindingApply: (binding: import("@zmkfirmware/zmk-studio-ts-client/keymap").BehaviorBinding) => void;
  encoderRotationLabel?: string;
  showLoading: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [oneU, setOneU] = useState(DEFAULT_ONE_U);

  const layout = layouts?.[selectedPhysicalLayoutIndex];

  // Compute keyboard extent in layout units
  const rightMost = layout?.keys
    .map((k) => k.x / 100 + k.width / 100)
    .reduce((a, b) => Math.max(a, b), 0) ?? 0;
  const bottomMost = layout?.keys
    .map((k) => k.y / 100 + k.height / 100)
    .reduce((a, b) => Math.max(a, b), 0) ?? 0;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const calculate = () => {
      setOneU(computeOneU(container.clientWidth, container.clientHeight, rightMost, bottomMost));
    };

    calculate();

    const resizeObserver = new ResizeObserver(calculate);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [rightMost, bottomMost]);

  return (
    <div
      ref={containerRef}
      className="p-4 col-start-2 row-start-1 flex items-center justify-center min-w-0 overflow-hidden bg-gray-200/50 rounded-lg"
    >
      {!showLoading && layouts && keymap && behaviors ? (
        <KeymapComp
          keymap={keymap}
          layout={layouts[selectedPhysicalLayoutIndex]}
          behaviors={behaviors}
          oneU={oneU}
          selectedLayerIndex={selectedLayerIndex}
          selectedKeyPosition={selectedKeyPosition}
          onKeyPositionClicked={onKeyPositionClicked}
          onBindingApply={onBindingApply}
          encoderRotationLabel={encoderRotationLabel}
        />
      ) : (
        <LoadingSpinner label="キーマップを読み込んでいます..." />
      )}
    </div>
  );
}

function useLayouts(): [
  PhysicalLayout[] | undefined,
  React.Dispatch<SetStateAction<PhysicalLayout[] | undefined>>,
  number,
  React.Dispatch<SetStateAction<number>>
] {
  const connection = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);

  const [layouts, setLayouts] = useState<PhysicalLayout[] | undefined>(
    undefined
  );
  const [selectedPhysicalLayoutIndex, setSelectedPhysicalLayoutIndex] =
    useState<number>(0);

  useEffect(() => {
    if (
      !connection.conn ||
      lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setLayouts(undefined);
      return;
    }

    async function startRequest() {
      setLayouts(undefined);

      if (!connection.conn) {
        return;
      }

      const response = await call_rpc(connection.conn, {
        keymap: { getPhysicalLayouts: true },
      });

      if (!ignore) {
        setLayouts(response?.keymap?.getPhysicalLayouts?.layouts);
        setSelectedPhysicalLayoutIndex(
          response?.keymap?.getPhysicalLayouts?.activeLayoutIndex || 0
        );
      }
    }

    let ignore = false;
    startRequest();

    return () => {
      ignore = true;
    };
  }, [connection, lockState]);

  return [
    layouts,
    setLayouts,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
  ];
}

export default function Keyboard() {
  const [
    layouts,
    ,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
  ] = useLayouts();
  const [keymap, setKeymap] = useConnectedDeviceData<Keymap>(
    { keymap: { getKeymap: true } },
    (keymap) => keymap?.keymap?.getKeymap,
    true
  );

  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0);
  const [selectedKeyPosition, setSelectedKeyPosition] = useState<
    number | undefined
  >(undefined);
  const behaviors = useBehaviorMap();
  const behaviorsLoading = useBehaviorsLoading();
  const isDataLoading = !layouts || !keymap || behaviorsLoading;
  const showLoading = useMinLoadingTime(isDataLoading);

  const conn = useContext(ConnectionContext);
  const undoRedo = useContext(UndoRedoContext);
  const { toast } = useToast();
  const { trackKeymap } = useTelemetry();

  useEffect(() => {
    setSelectedLayerIndex(0);
    setSelectedKeyPosition(undefined);
  }, [conn]);

  const keymapSentRef = useRef(false);
  useEffect(() => {
    if (!isDataLoading && keymap && !keymapSentRef.current) {
      keymapSentRef.current = true;
      try {
        trackKeymap("connect", JSON.stringify(keymap));
      } catch {
        // telemetry must never break the app
      }
    }
    if (isDataLoading) {
      keymapSentRef.current = false;
    }
  }, [isDataLoading, keymap, trackKeymap]);

  useSub("keymap_saved_success", () => {
    if (keymap) {
      try {
        trackKeymap("save", JSON.stringify(keymap));
      } catch {
        // telemetry must never break the app
      }
    }
  });

  useEffect(() => {
    async function performSetRequest() {
      if (!conn.conn || !layouts) {
        return;
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { setActivePhysicalLayout: selectedPhysicalLayoutIndex },
      });

      const new_keymap = resp?.keymap?.setActivePhysicalLayout?.ok;
      if (new_keymap) {
        setKeymap(new_keymap);
      } else {
        console.error(
          "Failed to set the active physical layout err:",
          resp?.keymap?.setActivePhysicalLayout?.err
        );
      }
    }

    performSetRequest();
  }, [selectedPhysicalLayoutIndex, conn.conn, layouts, setKeymap]);

  const doSelectPhysicalLayout = useCallback(
    (i: number) => {
      const oldLayout = selectedPhysicalLayoutIndex;
      undoRedo?.(async () => {
        setSelectedPhysicalLayoutIndex(i);

        return async () => {
          setSelectedPhysicalLayoutIndex(oldLayout);
        };
      });
    },
    [undoRedo, selectedPhysicalLayoutIndex, setSelectedPhysicalLayoutIndex]
  );

  const doUpdateBinding = useCallback(
    (binding: BehaviorBinding) => {
      if (!keymap || selectedKeyPosition === undefined) {
        console.error(
          "Can't update binding without a selected key position and loaded keymap"
        );
        return;
      }

      const layer = selectedLayerIndex;
      const layerId = keymap.layers[layer].id;
      const keyPosition = selectedKeyPosition;
      const oldBinding = keymap.layers[layer].bindings[keyPosition];
      undoRedo?.(async () => {
        if (!conn.conn) {
          throw new Error("Not connected");
        }

        const resp = await call_rpc(conn.conn, {
          keymap: { setLayerBinding: { layerId, keyPosition, binding } },
        });

        if (
          resp.keymap?.setLayerBinding ===
          SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
        ) {
          setKeymap(
            produce((draft: Keymap) => {
              draft.layers[layer].bindings[keyPosition] = binding;
            }) as (base: Keymap | undefined) => Keymap
          );
        } else {
          console.error("Failed to set binding", resp.keymap?.setLayerBinding);
          toast("Failed to set key binding", "error");
        }

        return async () => {
          if (!conn.conn) {
            return;
          }

          const resp = await call_rpc(conn.conn, {
            keymap: {
              setLayerBinding: { layerId, keyPosition, binding: oldBinding },
            },
          });
          if (
            resp.keymap?.setLayerBinding ===
            SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
          ) {
            setKeymap(
              produce((draft: Keymap) => {
                draft.layers[layer].bindings[keyPosition] = oldBinding;
              }) as (base: Keymap | undefined) => Keymap
            );
          } else {
            toast("Failed to undo key binding change", "error");
          }
        };
      });
    },
    [conn, keymap, undoRedo, selectedLayerIndex, selectedKeyPosition, setKeymap, toast]
  );

  const selectedBinding = useMemo(() => {
    if (keymap == null || selectedKeyPosition == null || !keymap.layers[selectedLayerIndex]) {
      return null;
    }

    return keymap.layers[selectedLayerIndex].bindings[selectedKeyPosition];
  }, [keymap, selectedLayerIndex, selectedKeyPosition]);

  const encoderSummary = useEncoderBindings(
    behaviors ? Object.values(behaviors) : [],
    selectedLayerIndex,
  );

  const moveLayer = useCallback(
    (start: number, end: number) => {
      const doMove = async (startIndex: number, destIndex: number) => {
        if (!conn.conn) {
          return;
        }

        const resp = await call_rpc(conn.conn, {
          keymap: { moveLayer: { startIndex, destIndex } },
        });

        if (resp.keymap?.moveLayer?.ok) {
          setKeymap(resp.keymap?.moveLayer?.ok);
          setSelectedLayerIndex(destIndex);
        } else {
          console.error("Error moving", resp);
        }
      };

      undoRedo?.(async () => {
        await doMove(start, end);
        return () => doMove(end, start);
      });
    },
    [undoRedo, conn.conn, setKeymap]
  );

  const addLayer = useCallback(() => {
    async function doAdd(): Promise<number> {
      if (!conn.conn || !keymap) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, { keymap: { addLayer: {} } });

      if (resp.keymap?.addLayer?.ok) {
        const newSelection = keymap.layers.length;
        setKeymap(
          produce((draft: Keymap) => {
            draft.layers.push(resp.keymap!.addLayer!.ok!.layer!);
            draft.availableLayers--;
          }) as (base: Keymap | undefined) => Keymap
        );

        setSelectedLayerIndex(newSelection);

        return resp.keymap.addLayer.ok.index;
      } else {
        console.error("Add error", resp.keymap?.addLayer?.err);
        throw new Error("Failed to add layer:" + resp.keymap?.addLayer?.err);
      }
    }

    async function doRemove(layerIndex: number) {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex } },
      });

      if (resp.keymap?.removeLayer?.ok) {
        setKeymap(
          produce((draft: Keymap) => {
            draft.layers.splice(layerIndex, 1);
            draft.availableLayers++;
          }) as (base: Keymap | undefined) => Keymap
        );
      } else {
        console.error("Remove error", resp.keymap?.removeLayer?.err);
        throw new Error(
          "Failed to remove layer:" + resp.keymap?.removeLayer?.err
        );
      }
    }

    undoRedo?.(async () => {
      const index = await doAdd();
      return () => doRemove(index);
    });
  }, [conn, undoRedo, keymap, setKeymap]);

  const removeLayer = useCallback(() => {
    async function doRemove(layerIndex: number): Promise<void> {
      if (!conn.conn || !keymap) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex } },
      });

      if (resp.keymap?.removeLayer?.ok) {
        if (layerIndex == keymap.layers.length - 1) {
          setSelectedLayerIndex(layerIndex - 1);
        }
        setKeymap(
          produce((draft: Keymap) => {
            draft.layers.splice(layerIndex, 1);
            draft.availableLayers++;
          }) as (base: Keymap | undefined) => Keymap
        );
      } else {
        console.error("Remove error", resp.keymap?.removeLayer?.err);
        throw new Error(
          "Failed to remove layer:" + resp.keymap?.removeLayer?.err
        );
      }
    }

    async function doRestore(layerId: number, atIndex: number) {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { restoreLayer: { layerId, atIndex } },
      });

      if (resp.keymap?.restoreLayer?.ok) {
        setKeymap(
          produce((draft: Keymap) => {
            draft.layers.splice(atIndex, 0, resp!.keymap!.restoreLayer!.ok!);
            draft.availableLayers--;
          }) as (base: Keymap | undefined) => Keymap
        );
        setSelectedLayerIndex(atIndex);
      } else {
        console.error("Remove error", resp.keymap?.restoreLayer?.err);
        throw new Error(
          "Failed to restore layer:" + resp.keymap?.restoreLayer?.err
        );
      }
    }

    if (!keymap) {
      throw new Error("No keymap loaded");
    }

    const index = selectedLayerIndex;
    const layerId = keymap.layers[index].id;
    undoRedo?.(async () => {
      await doRemove(index);
      return () => doRestore(layerId, index);
    });
  }, [conn, undoRedo, selectedLayerIndex, keymap, setKeymap]);

  const changeLayerName = useCallback(
    (id: number, oldName: string, newName: string) => {
      async function changeName(layerId: number, name: string) {
        if (!conn.conn) {
          throw new Error("Not connected");
        }

        const resp = await call_rpc(conn.conn, {
          keymap: { setLayerProps: { layerId, name } },
        });

        if (
          resp.keymap?.setLayerProps ==
          SetLayerPropsResponse.SET_LAYER_PROPS_RESP_OK
        ) {
          setKeymap(
            produce((draft: Keymap) => {
              const layer_index = draft.layers.findIndex(
                (l: Layer) => l.id == layerId
              );
              draft.layers[layer_index].name = name;
            }) as (base: Keymap | undefined) => Keymap
          );
        } else {
          throw new Error(
            "Failed to change layer name:" + resp.keymap?.setLayerProps
          );
        }
      }

      undoRedo?.(async () => {
        await changeName(id, newName);
        return async () => {
          await changeName(id, oldName);
        };
      });
    },
    [conn, undoRedo, setKeymap]
  );

  useEffect(() => {
    if (!keymap?.layers) return;

    const layers = keymap.layers.length - 1;

    if (selectedLayerIndex > layers) {
      setSelectedLayerIndex(layers);
    }
  }, [keymap, selectedLayerIndex]);

  return (
    <div className="grid grid-cols-[auto_1fr] grid-rows-[55fr_45fr] bg-base-300 max-w-full min-w-0 min-h-0 h-full">
      <div className="p-2 flex flex-col gap-2 bg-gray-50 border-r border-gray-200 row-span-2">
        {!showLoading && layouts ? (
          <div className="col-start-3 row-start-1 row-end-2">
            <PhysicalLayoutPicker
              layouts={layouts}
              selectedPhysicalLayoutIndex={selectedPhysicalLayoutIndex}
              onPhysicalLayoutClicked={doSelectPhysicalLayout}
            />
          </div>
        ) : (
          <div className="w-20 space-y-2 animate-pulse">
            <div className="h-3 w-12 bg-base-300 rounded" />
            <div className="h-8 w-full bg-base-300 rounded" />
          </div>
        )}

        {!showLoading && keymap ? (
          <div className="col-start-1 row-start-1 row-end-2">
            <LayerPicker
              layers={keymap.layers}
              selectedLayerIndex={selectedLayerIndex}
              onLayerClicked={setSelectedLayerIndex}
              onLayerMoved={moveLayer}
              canAdd={(keymap.availableLayers || 0) > 0}
              canRemove={(keymap.layers?.length || 0) > 1}
              onAddClicked={addLayer}
              onRemoveClicked={removeLayer}
              onLayerNameChanged={changeLayerName}
            />
          </div>
        ) : (
          <div className="w-20 space-y-1.5 animate-pulse">
            <div className="h-3 w-14 bg-base-300 rounded" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-7 w-full bg-base-300 rounded" />
            ))}
          </div>
        )}
      </div>
      <KeyboardArea
        layouts={layouts}
        keymap={keymap}
        behaviors={behaviors}
        selectedPhysicalLayoutIndex={selectedPhysicalLayoutIndex}
        selectedLayerIndex={selectedLayerIndex}
        selectedKeyPosition={selectedKeyPosition}
        onKeyPositionClicked={setSelectedKeyPosition}
        onBindingApply={doUpdateBinding}
        encoderRotationLabel={encoderSummary?.rotationLabel}
        showLoading={showLoading}
      />
      <div className="p-3 col-start-2 row-start-2 bg-white border-t border-gray-200 overflow-y-auto">
        {!showLoading && keymap && selectedBinding != null ? (
          <BehaviorBindingPicker
            binding={selectedBinding}
            behaviors={Object.values(behaviors)}
            layers={keymap.layers.map(({ id, name }, li) => ({
              id,
              name: name || li.toLocaleString(),
            }))}
            onBindingChanged={doUpdateBinding}
            keyPosition={selectedKeyPosition}
          />
        ) : !showLoading && keymap ? (
          <div className="flex items-center justify-center h-full text-base-content/40 text-sm">
            キーをクリックして設定を変更
          </div>
        ) : (
          <LoadingSpinner label="設定パネルを準備しています..." />
        )}
      </div>
    </div>
  );
}
