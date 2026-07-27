import { MousePointer2 } from "lucide-react";
import { SettingsCard } from "../misc/SettingsCard";
import { Switch } from "../misc/Switch";
import type { LayerDisplay } from "../rpc/layerTypes";

export interface AutoMouseLayerSectionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  layerId: number;
  onLayerChange: (layerId: number) => void;
  layers: LayerDisplay[];
  disabled?: boolean;
}

export function AutoMouseLayerSection({
  enabled,
  onEnabledChange,
  layerId,
  onLayerChange,
  layers,
  disabled = false,
}: AutoMouseLayerSectionProps) {
  const selectedLayer = layers.find((layer) => layer.id === layerId);
  const layerSelectionDisabled = disabled || !enabled || layers.length === 0;

  return (
    <SettingsCard
      title="自動マウスレイヤー"
      description="トラックボールを動かしたときだけ、マウス操作用のレイヤーに切り替えます。"
    >
      <div className="flex flex-col gap-3">
        <Switch
          isSelected={enabled}
          onChange={onEnabledChange}
          isDisabled={disabled}
          label="自動で切り替える"
          description={
            selectedLayer
              ? `トラックボールを動かすと「${selectedLayer.name}」に切り替わり、手を止めるともとに戻ります。`
              : "トラックボールを動かすと選んだレイヤーに切り替わり、手を止めるともとに戻ります。"
          }
        />

        <div
          className={`rounded-md border border-base-300/60 bg-base-100 px-3 py-2.5 transition-opacity ${
            layerSelectionDisabled ? "opacity-60" : ""
          }`}
        >
          <label
            htmlFor="auto-mouse-layer"
            className="mb-1.5 flex items-center gap-2 text-sm font-medium text-base-content"
          >
            <MousePointer2 className="size-4 text-primary" aria-hidden="true" />
            切り替えるレイヤー
          </label>
          {layers.length === 0 ? (
            <p className="min-h-11 content-center text-sm text-base-content/50">
              レイヤーを読み込んでいます…
            </p>
          ) : (
            <select
              id="auto-mouse-layer"
              value={layerId}
              disabled={layerSelectionDisabled}
              onChange={(event) => onLayerChange(Number(event.target.value))}
              className="min-h-11 w-full rounded-md border border-base-300 bg-base-100 px-3 text-sm text-base-content outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 disabled:cursor-not-allowed"
            >
              {layers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
