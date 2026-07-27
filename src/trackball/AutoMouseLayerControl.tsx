import { useCallback, useEffect, useRef, useState } from "react";
import { Switch } from "../misc/Switch";
import { useToast } from "../misc/Toast";
import { useCustomNotification, useCustomSubsystem } from "../rpc/useCustomSubsystem";
import { useLayers } from "../rpc/useLayers";
import type { LayerDisplay } from "../rpc/layerTypes";
import * as RIP from "../proto/rip";

export interface AutoMouseLayerControlViewProps {
  enabled: boolean;
  layerId: number;
  layers: LayerDisplay[];
  activationDelayMs: number;
  deactivationDelayMs: number;
  onEnabledChange: (enabled: boolean) => void;
  onLayerChange: (layerId: number) => void;
  onActivationDelayChange: (delayMs: number) => void;
  onDeactivationDelayChange: (delayMs: number) => void;
  onActivationDelayCommit: () => void;
  onDeactivationDelayCommit: () => void;
  disabled?: boolean;
  detailsOpen?: boolean;
}

export function AutoMouseLayerControlView({
  enabled,
  layerId,
  layers,
  activationDelayMs,
  deactivationDelayMs,
  onEnabledChange,
  onLayerChange,
  onActivationDelayChange,
  onDeactivationDelayChange,
  onActivationDelayCommit,
  onDeactivationDelayCommit,
  disabled = false,
  detailsOpen = false,
}: AutoMouseLayerControlViewProps) {
  const layerSelectionDisabled = disabled || !enabled || layers.length === 0;
  const delayControlsDisabled = disabled || !enabled;
  const [isDetailsOpen, setIsDetailsOpen] = useState(detailsOpen);

  useEffect(() => {
    setIsDetailsOpen(detailsOpen);
  }, [detailsOpen]);

  return (
    <section className="flex flex-col gap-1 rounded border border-base-300 bg-base-100 p-2">
      <h2 className="text-sm font-medium text-base-content">自動マウスレイヤー</h2>
      <Switch
        isSelected={enabled}
        onChange={onEnabledChange}
        isDisabled={disabled}
        label="自動で切り替える"
      />
      <label className="flex flex-col gap-1 px-2 text-sm text-base-content/70">
        切り替えるレイヤー
        {layers.length === 0 ? (
          <span className="min-h-11 content-center text-sm text-base-content/50">
            レイヤーを読み込んでいます…
          </span>
        ) : (
          <select
            aria-label="切り替えるレイヤー"
            value={layerId}
            disabled={layerSelectionDisabled}
            onChange={(event) => onLayerChange(Number(event.target.value))}
            className="min-h-11 w-full rounded border border-base-300 bg-base-100 px-2 text-sm text-base-content outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {layers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <details
        className="px-2"
        open={isDetailsOpen}
        onToggle={(event) => setIsDetailsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer rounded py-2 text-sm text-base-content/70 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100">
          切り替えの速さ
        </summary>
        <div className="flex flex-col gap-3 pb-1">
          <label className="flex flex-col gap-1 text-sm text-base-content/70">
            <span className="flex items-center justify-between gap-2">
              <span>切り替わるまで</span>
              <output className="shrink-0 font-medium text-base-content">
                {activationDelayMs} ms
              </output>
            </span>
            <input
              aria-label="切り替わるまでの時間"
              type="range"
              min={0}
              max={500}
              step={10}
              value={activationDelayMs}
              disabled={delayControlsDisabled}
              onChange={(event) => onActivationDelayChange(Number(event.target.value))}
              onPointerUp={onActivationDelayCommit}
              onBlur={onActivationDelayCommit}
              className="w-full cursor-pointer accent-primary outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-base-content/70">
            <span className="flex items-center justify-between gap-2">
              <span>もとに戻るまで</span>
              <output className="shrink-0 font-medium text-base-content">
                {deactivationDelayMs} ms
              </output>
            </span>
            <input
              aria-label="もとに戻るまでの時間"
              type="range"
              min={0}
              max={2000}
              step={50}
              value={deactivationDelayMs}
              disabled={delayControlsDisabled}
              onChange={(event) => onDeactivationDelayChange(Number(event.target.value))}
              onPointerUp={onDeactivationDelayCommit}
              onBlur={onDeactivationDelayCommit}
              className="w-full cursor-pointer accent-primary outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>
      </details>
    </section>
  );
}

export function AutoMouseLayerControl() {
  const subsystem = useCustomSubsystem(RIP.SUBSYSTEM_ID);
  const { toast } = useToast();
  const layers = useLayers().filter((layer) => layer.id !== 0);
  const [processor, setProcessor] = useState<RIP.InputProcessorInfo | null>(null);
  const [sending, setSending] = useState(false);
  const [activationDelayMs, setActivationDelayMs] = useState(100);
  const [deactivationDelayMs, setDeactivationDelayMs] = useState(500);
  const pendingDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDelay = useRef<{ type: "activation" | "deactivation"; value: number } | null>(null);

  useEffect(() => {
    if (!subsystem) {
      setProcessor(null);
      return;
    }
    const activeSubsystem = subsystem;

    async function discover() {
      try {
        await activeSubsystem.callRPC(RIP.encodeListInputProcessors());
      } catch (error) {
        console.error("Failed to discover trackball:", error);
      }
    }

    discover();
  }, [subsystem]);

  useCustomNotification(subsystem?.subsystemIndex, (payload) => {
    const notification = RIP.decodeNotification(payload);
    const updatedProcessor = notification.inputProcessorChanged;
    if (!updatedProcessor) return;

    setProcessor((current) =>
      current === null || current.id === updatedProcessor.id
        ? updatedProcessor
        : current
    );
  });

  useEffect(() => {
    if (!processor) return;
    setActivationDelayMs(processor.tempLayerActivationDelayMs);
    setDeactivationDelayMs(processor.tempLayerDeactivationDelayMs);
  }, [processor]);

  useEffect(() => () => {
    if (pendingDelayTimer.current) clearTimeout(pendingDelayTimer.current);
  }, []);

  const updateSetting = useCallback(
    async (
      nextProcessor: RIP.InputProcessorInfo,
      payload: Uint8Array
    ) => {
      if (!subsystem || !processor || sending) return;

      const previousProcessor = processor;
      setProcessor(nextProcessor);
      setSending(true);
      try {
        await subsystem.callRPC(payload);
      } catch (error) {
        console.error("Failed to update auto mouse layer:", error);
        setProcessor(previousProcessor);
        toast("自動マウスレイヤーの設定を更新できませんでした", "error");
      } finally {
        setSending(false);
      }
    },
    [processor, sending, subsystem, toast]
  );

  const handleEnabledChange = useCallback(
    (enabled: boolean) => {
      if (!processor) return;
      void updateSetting(
        { ...processor, tempLayerEnabled: enabled },
        RIP.encodeSetTempLayerEnabled(processor.id, enabled)
      );
    },
    [processor, updateSetting]
  );

  const handleLayerChange = useCallback(
    (layerId: number) => {
      if (!processor) return;
      void updateSetting(
        { ...processor, tempLayerLayer: layerId },
        RIP.encodeSetTempLayerLayer(processor.id, layerId)
      );
    },
    [processor, updateSetting]
  );

  const sendDelay = useCallback(
    (type: "activation" | "deactivation", delayMs: number) => {
      if (!processor) return;
      const isActivation = type === "activation";
      const currentDelay = isActivation
        ? processor.tempLayerActivationDelayMs
        : processor.tempLayerDeactivationDelayMs;
      if (currentDelay === delayMs) return;

      void updateSetting(
        isActivation
          ? { ...processor, tempLayerActivationDelayMs: delayMs }
          : { ...processor, tempLayerDeactivationDelayMs: delayMs },
        isActivation
          ? RIP.encodeSetTempLayerActivationDelay(processor.id, delayMs)
          : RIP.encodeSetTempLayerDeactivationDelay(processor.id, delayMs)
      );
    },
    [processor, updateSetting]
  );

  const commitPendingDelay = useCallback(() => {
    if (pendingDelayTimer.current) {
      clearTimeout(pendingDelayTimer.current);
      pendingDelayTimer.current = null;
    }
    const pending = pendingDelay.current;
    pendingDelay.current = null;
    if (pending) sendDelay(pending.type, pending.value);
  }, [sendDelay]);

  const queueDelayUpdate = useCallback(
    (type: "activation" | "deactivation", delayMs: number) => {
      if (type === "activation") setActivationDelayMs(delayMs);
      else setDeactivationDelayMs(delayMs);

      if (pendingDelayTimer.current) clearTimeout(pendingDelayTimer.current);
      pendingDelay.current = { type, value: delayMs };
      pendingDelayTimer.current = setTimeout(() => {
        pendingDelayTimer.current = null;
        commitPendingDelay();
      }, 300);
    },
    [commitPendingDelay]
  );

  if (!subsystem || !processor) return null;

  return (
    <AutoMouseLayerControlView
      enabled={processor.tempLayerEnabled}
      layerId={processor.tempLayerLayer}
      layers={layers}
      activationDelayMs={activationDelayMs}
      deactivationDelayMs={deactivationDelayMs}
      onEnabledChange={handleEnabledChange}
      onLayerChange={handleLayerChange}
      onActivationDelayChange={(delayMs) => queueDelayUpdate("activation", delayMs)}
      onDeactivationDelayChange={(delayMs) => queueDelayUpdate("deactivation", delayMs)}
      onActivationDelayCommit={commitPendingDelay}
      onDeactivationDelayCommit={commitPendingDelay}
      disabled={sending}
    />
  );
}
