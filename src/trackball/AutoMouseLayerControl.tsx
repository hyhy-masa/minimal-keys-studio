import { useCallback, useEffect, useState } from "react";
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
  onEnabledChange: (enabled: boolean) => void;
  onLayerChange: (layerId: number) => void;
  disabled?: boolean;
}

export function AutoMouseLayerControlView({
  enabled,
  layerId,
  layers,
  onEnabledChange,
  onLayerChange,
  disabled = false,
}: AutoMouseLayerControlViewProps) {
  const layerSelectionDisabled = disabled || !enabled || layers.length === 0;

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
    </section>
  );
}

export function AutoMouseLayerControl() {
  const subsystem = useCustomSubsystem(RIP.SUBSYSTEM_ID);
  const { toast } = useToast();
  const layers = useLayers().filter((layer) => layer.id !== 0);
  const [processor, setProcessor] = useState<RIP.InputProcessorInfo | null>(null);
  const [sending, setSending] = useState(false);

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

  if (!subsystem || !processor) return null;

  return (
    <AutoMouseLayerControlView
      enabled={processor.tempLayerEnabled}
      layerId={processor.tempLayerLayer}
      layers={layers}
      onEnabledChange={handleEnabledChange}
      onLayerChange={handleLayerChange}
      disabled={sending}
    />
  );
}
