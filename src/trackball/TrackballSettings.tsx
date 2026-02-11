import { useCallback, useEffect, useState } from "react";
import { Button } from "react-aria-components";
import {
  useCustomSubsystem,
  useCustomNotification,
} from "../rpc/useCustomSubsystem";
import * as RIP from "../proto/rip";

export function TrackballSettings() {
  const subsystem = useCustomSubsystem(RIP.SUBSYSTEM_ID);
  const [processorInfo, setProcessorInfo] =
    useState<RIP.InputProcessorInfo | null>(null);
  const [saving, setSaving] = useState(false);

  // Local form state (editable copy of processorInfo)
  const [multiplier, setMultiplier] = useState(1);
  const [divisor, setDivisor] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [xInvert, setXInvert] = useState(false);
  const [yInvert, setYInvert] = useState(false);
  const [xySwap, setXySwap] = useState(false);
  const [xyToScroll, setXyToScroll] = useState(false);
  const [axisSnapMode, setAxisSnapMode] = useState<RIP.AxisSnapMode>(0);
  const [axisSnapThreshold, setAxisSnapThreshold] = useState(0);
  const [axisSnapTimeout, setAxisSnapTimeout] = useState(0);

  // Load current config from device
  useEffect(() => {
    if (!subsystem) return;
    let ignore = false;

    async function load() {
      if (!subsystem) return;
      try {
        const payload = RIP.encodeGetInputProcessor(0);
        const resp = RIP.decodeResponse(await subsystem.callRPC(payload));
        if (!ignore && resp.getInputProcessor) {
          applyProcessorInfo(resp.getInputProcessor);
        }
      } catch (e) {
        console.error("Failed to load trackball config:", e);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [subsystem]);

  // Listen for real-time notifications
  useCustomNotification(subsystem?.subsystemIndex, (payload) => {
    const notif = RIP.decodeNotification(payload);
    if (notif.inputProcessorChanged) {
      applyProcessorInfo(notif.inputProcessorChanged);
    }
  });

  function applyProcessorInfo(info: RIP.InputProcessorInfo) {
    setProcessorInfo(info);
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

  const handleApply = useCallback(async () => {
    if (!subsystem || !processorInfo) return;
    setSaving(true);
    try {
      const id = processorInfo.id;
      // Send each changed setting individually
      if (multiplier !== processorInfo.scaleMultiplier) {
        await subsystem.callRPC(RIP.encodeSetScaleMultiplier(id, multiplier));
      }
      if (divisor !== processorInfo.scaleDivisor) {
        await subsystem.callRPC(RIP.encodeSetScaleDivisor(id, divisor));
      }
      if (rotation !== processorInfo.rotationDegrees) {
        await subsystem.callRPC(RIP.encodeSetRotation(id, rotation));
      }
      if (xInvert !== processorInfo.xInvert) {
        await subsystem.callRPC(RIP.encodeSetXInvert(id, xInvert));
      }
      if (yInvert !== processorInfo.yInvert) {
        await subsystem.callRPC(RIP.encodeSetYInvert(id, yInvert));
      }
      if (xySwap !== processorInfo.xySwapEnabled) {
        await subsystem.callRPC(RIP.encodeSetXySwapEnabled(id, xySwap));
      }
      if (xyToScroll !== processorInfo.xyToScrollEnabled) {
        await subsystem.callRPC(RIP.encodeSetXyToScrollEnabled(id, xyToScroll));
      }
      if (axisSnapMode !== processorInfo.axisSnapMode) {
        await subsystem.callRPC(RIP.encodeSetAxisSnapMode(id, axisSnapMode));
      }
      if (axisSnapThreshold !== processorInfo.axisSnapThreshold) {
        await subsystem.callRPC(
          RIP.encodeSetAxisSnapThreshold(id, axisSnapThreshold)
        );
      }
      if (axisSnapTimeout !== processorInfo.axisSnapTimeoutMs) {
        await subsystem.callRPC(
          RIP.encodeSetAxisSnapTimeout(id, axisSnapTimeout)
        );
      }
      // Reload to confirm
      const resp = RIP.decodeResponse(
        await subsystem.callRPC(RIP.encodeGetInputProcessor(id))
      );
      if (resp.getInputProcessor) {
        applyProcessorInfo(resp.getInputProcessor);
      }
    } catch (e) {
      console.error("Failed to apply trackball config:", e);
    } finally {
      setSaving(false);
    }
  }, [
    subsystem,
    processorInfo,
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
    if (!subsystem || !processorInfo) return;
    setSaving(true);
    try {
      await subsystem.callRPC(
        RIP.encodeResetInputProcessor(processorInfo.id)
      );
      const resp = RIP.decodeResponse(
        await subsystem.callRPC(RIP.encodeGetInputProcessor(processorInfo.id))
      );
      if (resp.getInputProcessor) {
        applyProcessorInfo(resp.getInputProcessor);
      }
    } catch (e) {
      console.error("Failed to reset trackball config:", e);
    } finally {
      setSaving(false);
    }
  }, [subsystem, processorInfo]);

  if (!subsystem) {
    return (
      <div className="p-4 text-base-content/60">
        <p>Trackball runtime configuration module is not available.</p>
        <p className="text-sm mt-2">
          Firmware needs{" "}
          <code>CONFIG_ZMK_RUNTIME_INPUT_PROCESSOR_STUDIO_RPC=y</code>
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <h2 className="text-lg font-semibold">
        Trackball Settings{" "}
        {processorInfo && (
          <span className="text-sm font-normal text-base-content/60">
            ({processorInfo.name})
          </span>
        )}
      </h2>

      {/* Scaling */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-base-content/70">
          Speed Scaling
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs">Multiplier</span>
            <input
              type="number"
              min={1}
              max={255}
              value={multiplier}
              onChange={(e) => setMultiplier(parseInt(e.target.value) || 1)}
              className="rounded px-2 py-1 bg-base-100 border border-base-300"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs">Divisor</span>
            <input
              type="number"
              min={1}
              max={255}
              value={divisor}
              onChange={(e) => setDivisor(parseInt(e.target.value) || 1)}
              className="rounded px-2 py-1 bg-base-100 border border-base-300"
            />
          </label>
        </div>
        <p className="text-xs text-base-content/50">
          Effective speed: {(multiplier / divisor).toFixed(2)}x
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
