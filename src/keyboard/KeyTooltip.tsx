import { createPortal } from "react-dom";
import type { TooltipData } from "./tooltip-data";

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface KeyTooltipProps {
  data: TooltipData | null;
  anchorRect: AnchorRect;
  encoderRotationLabel?: string;
  onTooltipMouseEnter?: () => void;
  onTooltipMouseLeave?: () => void;
  onEncoderPressSettingClick?: () => void;
  onEncoderRotationSettingClick?: () => void;
}

export function KeyTooltip({
  data,
  anchorRect,
  encoderRotationLabel,
  onTooltipMouseEnter,
  onTooltipMouseLeave,
  onEncoderPressSettingClick,
  onEncoderRotationSettingClick,
}: KeyTooltipProps) {
  if (!data) return null;

  // Position above the key, centered horizontally
  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    left: anchorRect.left + anchorRect.width / 2,
    top: anchorRect.top - 8,
    transform: "translate(-50%, -100%)",
    zIndex: 50,
  };

  const content = (() => {
    switch (data.type) {
      case "simple":
        return <SimpleTooltip data={data} />;
      case "detail":
        return <DetailTooltip data={data} />;
      case "encoder":
        return (
          <EncoderTooltip
            data={data}
            rotationLabel={encoderRotationLabel}
            onPressSettingClick={onEncoderPressSettingClick}
            onRotationSettingClick={onEncoderRotationSettingClick}
          />
        );
    }
  })();

  return createPortal(
    <div
      style={tooltipStyle}
      className="pointer-events-auto"
      onMouseEnter={onTooltipMouseEnter}
      onMouseLeave={onTooltipMouseLeave}
    >
      <div className="bg-white border border-gray-200 rounded-lg shadow-xl text-sm max-w-sm">
        {content}
      </div>
    </div>,
    document.body
  );
}

function SimpleTooltip({ data }: { data: TooltipData }) {
  return (
    <div className="px-3 py-2 flex items-center gap-2">
      <span className="font-medium text-base">{data.roleName}</span>
      {data.description && (
        <>
          <span className="text-base-content/30">—</span>
          <span className="text-base-content/70">{data.description}</span>
        </>
      )}
    </div>
  );
}

function DetailTooltip({ data }: { data: TooltipData }) {
  return (
    <div className="px-3 py-2.5 flex flex-col gap-2">
      <div>
        <div className="font-medium text-base">{data.roleName}</div>
        {data.description && (
          <div className="text-sm text-base-content/70 mt-0.5">{data.description}</div>
        )}
      </div>
    </div>
  );
}

function EncoderTooltip({
  data,
  rotationLabel,
  onPressSettingClick,
  onRotationSettingClick,
}: {
  data: TooltipData;
  rotationLabel?: string;
  onPressSettingClick?: () => void;
  onRotationSettingClick?: () => void;
}) {
  return (
    <div className="px-3 py-2.5 flex flex-col gap-2">
      <div className="font-medium text-base">🎛 ロータリーエンコーダ</div>
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span>
            <span className="text-base-content/50">回す: </span>
            {rotationLabel ?? "未設定"}
          </span>
          <button
            className="text-primary hover:underline whitespace-nowrap"
            onClick={onRotationSettingClick}
          >
            設定→
          </button>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>
            <span className="text-base-content/50">押す: </span>
            {data.roleName}
          </span>
          <button
            className="text-primary hover:underline whitespace-nowrap"
            onClick={onPressSettingClick}
          >
            設定→
          </button>
        </div>
      </div>
      {data.encoderOptions && data.encoderOptions.length > 0 && (
        <>
          <div className="border-t border-base-300" />
          <div className="text-sm">
            <div className="text-base-content/50 mb-0.5">回すで調整できること:</div>
            <div className="text-base-content/70">
              {data.encoderOptions.map((opt) => opt.label).join(" / ")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
