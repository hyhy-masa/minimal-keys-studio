import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { SubsystemUnavailable } from "../misc/SubsystemUnavailable";
import {
  useCustomSubsystem,
  useCustomNotification,
} from "../rpc/useCustomSubsystem";
import { useToast } from "../misc/Toast";
import * as RIP from "../proto/rip";

export function TrackballSettings() {
  const subsystem = useCustomSubsystem(RIP.SUBSYSTEM_ID);
  const { toast } = useToast();
  const [processors, setProcessors] = useState<RIP.InputProcessorInfo[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Local form state (editable copy of selected processor)
  // Speed is represented as multiplier/divisor. We use divisor=2 as base
  // so 0.5 steps work: 0.5x=1/2, 1.0x=2/2, 1.5x=3/2, 2.0x=4/2, etc.
  const [multiplier, setMultiplier] = useState(1);
  const [divisor, setDivisor] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Derived speed value for slider (in 0.5 steps)
  const speedValue = divisor > 0 ? multiplier / divisor : 1;
  const setSpeed = useCallback((speed: number) => {
    // Convert speed to multiplier/divisor with divisor=2
    // speed 0.5 → 1/2, speed 1.0 → 2/2=1/1, speed 1.5 → 3/2, etc.
    const newMultiplier = Math.round(speed * 2);
    setMultiplier(newMultiplier);
    setDivisor(2);
  }, []);
  const [xInvert, setXInvert] = useState(false);
  const [yInvert, setYInvert] = useState(false);
  const [xySwap, setXySwap] = useState(false);
  const [xyToScroll, setXyToScroll] = useState(false);
  const [axisSnapMode, setAxisSnapMode] = useState<RIP.AxisSnapMode>(0);
  const [axisSnapThreshold, setAxisSnapThreshold] = useState(0);
  const [axisSnapTimeout, setAxisSnapTimeout] = useState(0);

  // Discover processors via listInputProcessors (data arrives via notifications)
  useEffect(() => {
    if (!subsystem) {
      setProcessors([]);
      setSelectedId(null);
      return;
    }

    async function discover() {
      if (!subsystem) return;
      try {
        await subsystem.callRPC(RIP.encodeListInputProcessors());
        // Response is empty; processor info arrives via notifications
      } catch (e) {
        console.error("Failed to discover processors:", e);
        toast("Failed to discover trackball", "error");
      }
    }

    discover();
  }, [subsystem]);

  // Listen for notifications (processor discovery + real-time updates)
  const formDirty = useRef(false);

  useCustomNotification(subsystem?.subsystemIndex, (payload) => {
    const notif = RIP.decodeNotification(payload);
    if (notif.inputProcessorChanged) {
      const proc = notif.inputProcessorChanged;
      // Always update processor list
      setProcessors((prev) => {
        const idx = prev.findIndex((p) => p.id === proc.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = proc;
          return updated;
        }
        return [...prev, proc];
      });

      // Auto-select first processor on initial discovery
      setSelectedId((currentId) => {
        if (currentId === null) {
          applyProcessorInfo(proc);
          formDirty.current = false;
          return proc.id;
        }
        return currentId;
      });
    }
  });

  function applyProcessorInfo(info: RIP.InputProcessorInfo) {
    setMultiplier(info.scaleMultiplier);
    setDivisor(info.scaleDivisor);
    setRotation(info.rotationDegrees);
    setXInvert(info.xInvert);
    setYInvert(info.yInvert);
    setXySwap(info.xySwapEnabled);
    setXyToScroll(info.xyToScrollEnabled);
    setAxisSnapMode(info.axisSnapMode);
    setAxisSnapThreshold(info.axisSnapThreshold);
    setAxisSnapTimeout(info.axisSnapTimeoutMs);
  }

  const selectedProcessor = processors.find((p) => p.id === selectedId) ?? null;

  const callWithTimeout = useCallback(
    async (label: string, payload: Uint8Array) => {
      if (!subsystem) throw new Error("No subsystem");
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`RPC timeout: ${label}`)), 5000)
      );
      await Promise.race([subsystem.callRPC(payload), timeout]);
    },
    [subsystem]
  );

  const handleApply = useCallback(async () => {
    if (!subsystem || selectedId === null || !selectedProcessor) return;
    setSaving(true);
    try {
      const id = selectedId;
      if (multiplier !== selectedProcessor.scaleMultiplier) {
        await callWithTimeout("setScaleMultiplier", RIP.encodeSetScaleMultiplier(id, multiplier));
      }
      if (divisor !== selectedProcessor.scaleDivisor) {
        await callWithTimeout("setScaleDivisor", RIP.encodeSetScaleDivisor(id, divisor));
      }
      if (rotation !== selectedProcessor.rotationDegrees) {
        await callWithTimeout("setRotation", RIP.encodeSetRotation(id, rotation));
      }
      if (xInvert !== selectedProcessor.xInvert) {
        await callWithTimeout("setXInvert", RIP.encodeSetXInvert(id, xInvert));
      }
      if (yInvert !== selectedProcessor.yInvert) {
        await callWithTimeout("setYInvert", RIP.encodeSetYInvert(id, yInvert));
      }
      if (xySwap !== selectedProcessor.xySwapEnabled) {
        await callWithTimeout("setXySwapEnabled", RIP.encodeSetXySwapEnabled(id, xySwap));
      }
      if (xyToScroll !== selectedProcessor.xyToScrollEnabled) {
        await callWithTimeout("setXyToScrollEnabled", RIP.encodeSetXyToScrollEnabled(id, xyToScroll));
      }
      if (axisSnapMode !== selectedProcessor.axisSnapMode) {
        await callWithTimeout("setAxisSnapMode", RIP.encodeSetAxisSnapMode(id, axisSnapMode));
      }
      if (axisSnapThreshold !== selectedProcessor.axisSnapThreshold) {
        await callWithTimeout("setAxisSnapThreshold", RIP.encodeSetAxisSnapThreshold(id, axisSnapThreshold));
      }
      if (axisSnapTimeout !== selectedProcessor.axisSnapTimeoutMs) {
        await callWithTimeout("setAxisSnapTimeout", RIP.encodeSetAxisSnapTimeout(id, axisSnapTimeout));
      }
      formDirty.current = false;
    } catch (e) {
      console.error("Failed to apply trackball config:", e);
      toast("Failed to apply trackball settings", "error");
    } finally {
      setSaving(false);
    }
  }, [
    subsystem,
    callWithTimeout,
    selectedId,
    selectedProcessor,
    multiplier,
    divisor,
    rotation,
    xInvert,
    yInvert,
    xySwap,
    xyToScroll,
    axisSnapMode,
    axisSnapThreshold,
    axisSnapTimeout,
  ]);

  const handleReset = useCallback(async () => {
    if (!subsystem || selectedId === null) return;
    setSaving(true);
    try {
      await subsystem.callRPC(RIP.encodeResetInputProcessor(selectedId));
      formDirty.current = false;
    } catch (e) {
      console.error("Failed to reset trackball config:", e);
      toast("Failed to reset trackball settings", "error");
    } finally {
      setSaving(false);
    }
  }, [subsystem, selectedId]);

  if (!subsystem) {
    return (
      <SubsystemUnavailable
        featureName="トラックボール設定"
        explanation="キーボードのファームウェアがこの機能に対応していないか、接続方法を確認してください。"
        technicalDetails="CONFIG_ZMK_RUNTIME_INPUT_PROCESSOR_STUDIO_RPC=y"
      />
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <h2 className="text-lg font-semibold">
        Trackball Settings{" "}
        {selectedProcessor && (
          <span className="text-sm font-normal text-base-content/60">
            ({selectedProcessor.name})
          </span>
        )}
      </h2>

      {/* Processor selector (if multiple) */}
      {processors.length > 1 && (
        <section className="flex gap-2">
          {processors.map((p) => (
            <Button
              key={p.id}
              className={`rounded px-3 py-1 text-sm ${selectedId === p.id ? "bg-primary text-primary-content" : "bg-base-300"}`}
              onPress={() => {
                setSelectedId(p.id);
                applyProcessorInfo(p);
              }}
            >
              {p.name}
            </Button>
          ))}
        </section>
      )}

      {processors.length === 0 && (
        <p className="text-base-content/50 text-sm">Discovering processors...</p>
      )}

      {/* Speed */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-base-content/70">
          Speed
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-base-content/50 w-8">0.5x</span>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.5}
            value={speedValue}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-base-content/50 w-8">5.0x</span>
        </div>
        <p className="text-sm font-medium text-center">
          {speedValue.toFixed(1)}x
        </p>
      </section>

      {/* Rotation */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-base-content/70">Rotation</h3>
        <label className="flex flex-col gap-1">
          <span className="text-xs">Degrees</span>
          <input
            type="number"
            min={-180}
            max={180}
            value={rotation}
            onChange={(e) => setRotation(parseInt(e.target.value) || 0)}
            className="rounded px-2 py-1 bg-base-100 border border-base-300"
          />
        </label>
      </section>

      {/* Axis Controls */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-base-content/70">
          Axis Controls
        </h3>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={xInvert}
              onChange={(e) => setXInvert(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Invert X axis</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={yInvert}
              onChange={(e) => setYInvert(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Invert Y axis</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={xySwap}
              onChange={(e) => setXySwap(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Swap X/Y axes</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={xyToScroll}
              onChange={(e) => setXyToScroll(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">XY to Scroll mode</span>
          </label>
        </div>
      </section>

      {/* Axis Snapping */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-base-content/70">
          Axis Snapping
        </h3>
        <label className="flex flex-col gap-1">
          <span className="text-xs">Snap Mode</span>
          <select
            value={axisSnapMode}
            onChange={(e) =>
              setAxisSnapMode(parseInt(e.target.value) as RIP.AxisSnapMode)
            }
            className="rounded px-2 py-1 bg-base-100 border border-base-300"
          >
            <option value={0}>None</option>
            <option value={1}>X axis</option>
            <option value={2}>Y axis</option>
          </select>
        </label>
        {axisSnapMode !== 0 && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs">Threshold</span>
              <input
                type="number"
                min={0}
                value={axisSnapThreshold}
                onChange={(e) =>
                  setAxisSnapThreshold(parseInt(e.target.value) || 0)
                }
                className="rounded px-2 py-1 bg-base-100 border border-base-300"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs">Timeout (ms)</span>
              <input
                type="number"
                min={0}
                value={axisSnapTimeout}
                onChange={(e) =>
                  setAxisSnapTimeout(parseInt(e.target.value) || 0)
                }
                className="rounded px-2 py-1 bg-base-100 border border-base-300"
              />
            </label>
          </div>
        )}
      </section>

      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          className="rounded bg-primary text-primary-content px-4 py-2 hover:opacity-90 disabled:opacity-50"
          isDisabled={saving}
          onPress={handleApply}
        >
          {saving ? "Applying..." : "Apply"}
        </Button>
        <Button
          className="rounded bg-base-300 px-4 py-2 hover:bg-base-200"
          onPress={handleReset}
        >
          Reset to Default
        </Button>
      </div>
    </div>
  );
}
