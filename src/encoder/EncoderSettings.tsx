import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { SubsystemUnavailable } from "../misc/SubsystemUnavailable";
import {
  useCustomSubsystem,
} from "../rpc/useCustomSubsystem";
import { useToast } from "../misc/Toast";
import * as RSR from "../proto/rsr";
import { useLayers } from "../rpc/useLayers";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { useBehaviorList } from "../behaviors/BehaviorsContext";

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
      const cwRsr = behaviorToRsrBinding(cwBinding, behaviors);
      const ccwRsr = behaviorToRsrBinding(ccwBinding, behaviors);

      const cwBehavior = behaviors.find((b) => b.id === cwRsr.behaviorId);
      const ccwBehavior = behaviors.find((b) => b.id === ccwRsr.behaviorId);
      console.debug(`[Encoder] Saving sensor=${selectedSensorIndex} layer=${selectedLayer}`);
      console.debug(`[Encoder] CW: behaviorId=${cwRsr.behaviorId} (${cwBehavior?.displayName ?? 'unknown'}) param1=${cwRsr.param1} param2=${cwRsr.param2} tapMs=${cwRsr.tapMs}`);
      console.debug(`[Encoder] CCW: behaviorId=${ccwRsr.behaviorId} (${ccwBehavior?.displayName ?? 'unknown'}) param1=${ccwRsr.param1} param2=${ccwRsr.param2} tapMs=${ccwRsr.tapMs}`);
      console.debug(`[Encoder] behaviors known to Studio: ${behaviors.length} -> ${behaviors.map((b) => `${b.id}:${b.displayName}`).join(" | ")}`);
      console.debug(`[Encoder] layers reported by FW: ${JSON.stringify(layers.map((l) => ({ id: l.id, index: l.index, name: l.name })))}`);
      console.debug(`[Encoder] selectedLayer=${selectedLayer} (this is a layer *id*, sent verbatim to the FW)`);

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
  }, [subsystem, selectedSensorIndex, selectedLayer, cwBinding, ccwBinding, callWithTimeout, behaviors, layers, toast]);

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

/**
 * Hold time the firmware keeps the bound behavior pressed on each detent.
 *
 * Must be > 0: behavior_queue only defers the release when `wait > 0`
 * (zmk/app/src/behavior_queue.c), so with 0 the press and the release run in
 * the same loop iteration. 5 matches the devicetree default on &rsr_trans.
 */
const ENCODER_TAP_MS = 5;

/**
 * Hold time for behaviors that emit movement *while held* rather than once.
 *
 * mouse_scroll / mouse_move are "zmk,behavior-input-two-axis": they emit
 * `speed * trigger_period_ms / 1000` units every trigger period, and the period
 * defaults to 16ms (zmk,behavior-input-two-axis.yaml). A 5ms tap therefore ends
 * before the first period elapses and produces *zero* movement — assigning
 * scroll to an encoder looked completely dead.
 *
 * 30ms clears the 16ms period with a full period of margin, so one detent always
 * yields at least one wheel unit. (The firmware's own
 * behavior_sensor_rotate_mouse_wheel_up_down node uses `tap-ms = <20>`, but that
 * node is never referenced from the keymap, so 20 is an intent, not a measured
 * value — and it leaves no margin.)
 */
const ENCODER_TAP_MS_HELD = 30;

/** Behaviors whose output depends on how long they are held (see above). */
const HELD_BEHAVIOR_NAMES = ["mouse_scroll", "mouse_move"];

function behaviorToRsrBinding(
  b: BehaviorBinding,
  behaviors: GetBehaviorDetailsResponse[],
): RSR.Binding {
  const displayName = behaviors.find((x) => x.id === b.behaviorId)?.displayName;
  const tapMs = HELD_BEHAVIOR_NAMES.includes(displayName ?? "")
    ? ENCODER_TAP_MS_HELD
    : ENCODER_TAP_MS;
  return {
    behaviorId: b.behaviorId,
    param1: b.param1 ?? 0,
    param2: b.param2 ?? 0,
    tapMs,
  };
}
