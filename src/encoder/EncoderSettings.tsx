import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { SubsystemUnavailable } from "../misc/SubsystemUnavailable";
import {
  useCustomSubsystem,
} from "../rpc/useCustomSubsystem";
import { useToast } from "../misc/Toast";
import * as RSR from "../proto/rsr";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { call_rpc } from "../rpc/logging";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { useBehaviorList } from "../behaviors/BehaviorsContext";

interface LayerDisplay {
  id: number;
  name: string;
}

function useLayers(): LayerDisplay[] {
  const connection = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const [layers, setLayers] = useState<LayerDisplay[]>([]);

  useEffect(() => {
    if (
      !connection.conn ||
      lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setLayers([]);
      return;
    }

    let ignore = false;

    async function load() {
      if (!connection.conn) return;
      const resp = await call_rpc(connection.conn, {
        keymap: { getKeymap: true },
      });
      if (ignore) return;

      const km = resp?.keymap?.getKeymap;
      if (km?.layers) {
        setLayers(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          km.layers.map((l: any, i: number) => ({
            id: l.id ?? i,
            name: l.name || `Layer ${i}`,
          }))
        );
      }
    }

    load();
    return () => { ignore = true; };
  }, [connection, lockState]);

  return layers;
}

export function EncoderSettings() {
  const subsystem = useCustomSubsystem(RSR.SUBSYSTEM_ID);
  const { toast } = useToast();
  const behaviors = useBehaviorList();
  const layers = useLayers();

  const [sensors, setSensors] = useState<RSR.SensorInfo[]>([]);
  const [selectedSensorIndex, setSelectedSensorIndex] = useState<number | null>(null);
  const [layerBindings, setLayerBindings] = useState<RSR.LayerBindings[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Local editable state for CW/CCW bindings
  const [cwBinding, setCwBinding] = useState<BehaviorBinding>({
    behaviorId: 0, param1: 0, param2: 0,
  });
  const [ccwBinding, setCcwBinding] = useState<BehaviorBinding>({
    behaviorId: 0, param1: 0, param2: 0,
  });

  const callWithTimeout = useCallback(
    async (label: string, payload: Uint8Array, timeoutMs = 5000) => {
      if (!subsystem) throw new Error("No subsystem");
      console.debug(`[Encoder] RPC: ${label}`);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`RPC timeout: ${label}`)), timeoutMs)
      );
      const data = await Promise.race([subsystem.callRPC(payload), timeout]);
      return RSR.decodeResponse(data);
    },
    [subsystem]
  );

  // Version counter to handle React StrictMode double-invocation.
  // StrictMode runs effects twice: the first run's response is stale
  // and should be ignored; only the latest version's response is used.
  const discoveryVersionRef = useRef(0);

  // Discover sensors and load initial bindings in one pass
  useEffect(() => {
    if (!subsystem) {
      setSensors([]);
      setSelectedSensorIndex(null);
      setLayerBindings([]);
      return;
    }

    const version = ++discoveryVersionRef.current;

    async function discoverAndLoad() {
      setLoading(true);
      try {
        console.debug(`[Encoder] Discovering sensors... (v${version})`);
        const resp = await callWithTimeout("getSensors", RSR.encodeGetSensors(), 15000);
        if (version !== discoveryVersionRef.current) return;

        const sensorList = resp.getSensors?.sensors ?? [];
        console.debug("[Encoder] Found sensors:", JSON.stringify(sensorList));
        setSensors(sensorList);

        if (sensorList.length > 0) {
          const firstIndex = sensorList[0].index;
          setSelectedSensorIndex(firstIndex);

          // Immediately load bindings for the first sensor
          const bindResp = await callWithTimeout(
            "getAllLayerBindings",
            RSR.encodeGetAllLayerBindings(firstIndex),
            15000
          );
          if (version !== discoveryVersionRef.current) return;

          if (bindResp.getAllLayerBindings?.bindings) {
            console.debug("[Encoder] Layer bindings:", JSON.stringify(bindResp.getAllLayerBindings.bindings));
            setLayerBindings(bindResp.getAllLayerBindings.bindings);
          }
        }
      } catch (e) {
        if (version === discoveryVersionRef.current) {
          console.error("[Encoder] Failed to discover sensors:", e);
          toast("Failed to discover encoder", "error");
        }
      } finally {
        if (version === discoveryVersionRef.current) setLoading(false);
      }
    }

    discoverAndLoad();
  }, [subsystem, callWithTimeout, toast]);

  // Reload bindings when user switches sensor (not on initial load)
  const loadBindingsForSensor = useCallback(async (sensorIndex: number) => {
    if (!subsystem) return;
    setLoading(true);
    try {
      const resp = await callWithTimeout(
        "getAllLayerBindings",
        RSR.encodeGetAllLayerBindings(sensorIndex)
      );
      if (resp.getAllLayerBindings?.bindings) {
        setLayerBindings(resp.getAllLayerBindings.bindings);
      }
    } catch (e) {
      console.error("[Encoder] Failed to load bindings:", e);
      toast("Failed to load encoder bindings", "error");
    } finally {
      setLoading(false);
    }
  }, [subsystem, callWithTimeout, toast]);

  // Update local form state when selected layer changes
  useEffect(() => {
    const lb = layerBindings.find((b) => b.layer === selectedLayer);
    if (lb) {
      setCwBinding(rsrBindingToBehavior(lb.cwBinding));
      setCcwBinding(rsrBindingToBehavior(lb.ccwBinding));
    } else {
      setCwBinding({ behaviorId: 0, param1: 0, param2: 0 });
      setCcwBinding({ behaviorId: 0, param1: 0, param2: 0 });
    }
  }, [selectedLayer, layerBindings]);

  const selectedSensor = useMemo(
    () => sensors.find((s) => s.index === selectedSensorIndex) ?? null,
    [sensors, selectedSensorIndex]
  );

  const handleSave = useCallback(async () => {
    if (!subsystem || selectedSensorIndex === null) return;
    setSaving(true);
    try {
      const cwRsr = behaviorToRsrBinding(cwBinding);
      const ccwRsr = behaviorToRsrBinding(ccwBinding);

      const cwBehavior = behaviors.find((b) => b.id === cwRsr.behaviorId);
      const ccwBehavior = behaviors.find((b) => b.id === ccwRsr.behaviorId);
      console.debug(`[Encoder] Saving sensor=${selectedSensorIndex} layer=${selectedLayer}`);
      console.debug(`[Encoder] CW: behaviorId=${cwRsr.behaviorId} (${cwBehavior?.displayName ?? 'unknown'}) param1=${cwRsr.param1} param2=${cwRsr.param2}`);
      console.debug(`[Encoder] CCW: behaviorId=${ccwRsr.behaviorId} (${ccwBehavior?.displayName ?? 'unknown'}) param1=${ccwRsr.param1} param2=${ccwRsr.param2}`);

      const cwResp = await callWithTimeout(
        "setLayerCwBinding",
        RSR.encodeSetLayerCwBinding(selectedSensorIndex, selectedLayer, cwRsr)
      );
      console.debug("[Encoder] CW set response:", JSON.stringify(cwResp));
      if (cwResp.error) {
        console.error("[Encoder] CW set error:", cwResp.error);
        toast("Failed to set clockwise binding", "error");
      }

      const ccwResp = await callWithTimeout(
        "setLayerCcwBinding",
        RSR.encodeSetLayerCcwBinding(selectedSensorIndex, selectedLayer, ccwRsr)
      );
      console.debug("[Encoder] CCW set response:", JSON.stringify(ccwResp));
      if (ccwResp.error) {
        console.error("[Encoder] CCW set error:", ccwResp.error);
        toast("Failed to set counter-clockwise binding", "error");
      }

      // Reload bindings to confirm saved values
      const resp = await callWithTimeout(
        "getAllLayerBindings",
        RSR.encodeGetAllLayerBindings(selectedSensorIndex)
      );
      if (resp.getAllLayerBindings?.bindings) {
        const savedLayer = resp.getAllLayerBindings.bindings.find(
          (b: RSR.LayerBindings) => b.layer === selectedLayer
        );
        console.debug(`[Encoder] Verified layer ${selectedLayer} after save:`, JSON.stringify(savedLayer));
        setLayerBindings(resp.getAllLayerBindings.bindings);
      }
    } catch (e) {
      console.error("[Encoder] Failed to save:", e);
      toast("Failed to save encoder settings", "error");
    } finally {
      setSaving(false);
    }
  }, [subsystem, selectedSensorIndex, selectedLayer, cwBinding, ccwBinding, callWithTimeout, behaviors, toast]);

  if (!subsystem) {
    return (
      <SubsystemUnavailable
        featureName="エンコーダー設定"
        explanation="キーボードのファームウェアがこの機能に対応していないか、接続方法を確認してください。"
        technicalDetails="CONFIG_ZMK_RUNTIME_SENSOR_ROTATE=y, CONFIG_ZMK_RUNTIME_SENSOR_ROTATE_STUDIO_RPC=y"
      />
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <h2 className="text-lg font-semibold">
        エンコーダー設定{" "}
        {selectedSensor && (
          <span className="text-sm font-normal text-base-content/60">
            ({selectedSensor.name})
          </span>
        )}
      </h2>

      {/* Sensor selector (if multiple) */}
      {sensors.length > 1 && (
        <section className="flex gap-2">
          {sensors.map((s) => (
            <Button
              key={s.index}
              className={`rounded px-3 py-1 text-sm ${
                selectedSensorIndex === s.index
                  ? "bg-primary text-primary-content"
                  : "bg-base-300"
              }`}
              onPress={() => {
                setSelectedSensorIndex(s.index);
                loadBindingsForSensor(s.index);
              }}
            >
              {s.name || `Sensor ${s.index}`}
            </Button>
          ))}
        </section>
      )}

      {sensors.length === 0 && (
        <p className="text-base-content/50 text-sm">センサー検出中...</p>
      )}

      {loading && (
        <p className="text-base-content/50 text-sm">設定を読み込み中...</p>
      )}

      {/* Layer tabs */}
      {sensors.length > 0 && !loading && (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-base-content/70">レイヤー</h3>
            <div className="flex gap-1 flex-wrap">
              {layers.map((layer) => (
                <button
                  key={layer.id}
                  className={`rounded px-3 py-1 text-sm ${
                    selectedLayer === layer.id
                      ? "bg-primary text-primary-content"
                      : "bg-base-300 hover:bg-base-200"
                  }`}
                  onClick={() => setSelectedLayer(layer.id)}
                >
                  {layer.name}
                </button>
              ))}
            </div>
          </section>

          {/* CW binding */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-base-content/70">
              時計回り (CW)
            </h3>
            {behaviors.length > 0 ? (
              <BehaviorBindingPicker
                binding={cwBinding}
                behaviors={behaviors}
                layers={layers}
                onBindingChanged={setCwBinding}
              />
            ) : (
              <p className="text-base-content/50 text-sm">ビヘイビア読み込み中...</p>
            )}
          </section>

          {/* CCW binding */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-base-content/70">
              反時計回り (CCW)
            </h3>
            {behaviors.length > 0 ? (
              <BehaviorBindingPicker
                binding={ccwBinding}
                behaviors={behaviors}
                layers={layers}
                onBindingChanged={setCcwBinding}
              />
            ) : (
              <p className="text-base-content/50 text-sm">ビヘイビア読み込み中...</p>
            )}
          </section>

          {/* Save button */}
          <div className="flex gap-2 pt-2">
            <Button
              className="rounded bg-primary text-primary-content px-4 py-2 hover:opacity-90 disabled:opacity-50"
              isDisabled={saving}
              onPress={handleSave}
            >
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Helpers to convert between RSR Binding and BehaviorBinding ---

function rsrBindingToBehavior(b: RSR.Binding | null): BehaviorBinding {
  if (!b) return { behaviorId: 0, param1: 0, param2: 0 };
  return {
    behaviorId: b.behaviorId,
    param1: b.param1,
    param2: b.param2,
  };
}

function behaviorToRsrBinding(b: BehaviorBinding): RSR.Binding {
  return {
    behaviorId: b.behaviorId,
    param1: b.param1 ?? 0,
    param2: b.param2 ?? 0,
    tapMs: 0,
  };
}
