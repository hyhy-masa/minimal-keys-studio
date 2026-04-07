import {
  CSSProperties,
  PropsWithChildren,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Key } from "./Key";
import { ENCODER_POSITION } from "./key-descriptions";

export type KeyPosition = PropsWithChildren<{
  id: string;
  header?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  r?: number;
  rx?: number;
  ry?: number;
  tooltipData?: import("./tooltip-data").TooltipData | null;
}>;

export type LayoutZoom = number | "auto";

// eslint-disable-next-line react-refresh/only-export-components
export function deserializeLayoutZoom(value: string): LayoutZoom {
  if (value === "auto") {
    return "auto";
  }
  return parseFloat(value) || "auto";
}

interface PhysicalLayoutProps {
  positions: Array<KeyPosition>;
  selectedPosition?: number;
  oneU?: number;
  zoom?: LayoutZoom;
  onPositionClicked?: (position: number) => void;
  onRecommendationClick?: (rec: import("./key-roles").KeyRecommendation) => void;
  encoderRotationLabel?: string;
}

interface PhysicalLayoutPositionLocation {
  x: number;
  y: number;
  r?: number;
  rx?: number;
  ry?: number;
}

function scalePosition(
  { x, y, r, rx, ry }: PhysicalLayoutPositionLocation,
  effectiveOneU: number,
): CSSProperties {
  const left = x * effectiveOneU;
  const top = y * effectiveOneU;
  let transformOrigin = undefined;
  let transform = undefined;

  if (r) {
    const transformX = ((rx || x) - x) * effectiveOneU;
    const transformY = ((ry || y) - y) * effectiveOneU;
    transformOrigin = `${transformX}px ${transformY}px`;
    transform = `rotate(${r}deg)`;
  }

  return {
    top,
    left,
    transformOrigin,
    transform,
  };
}

export const PhysicalLayout = ({
  positions,
  selectedPosition,
  oneU = 56,
  zoom,
  onPositionClicked,
  onRecommendationClick,
  encoderRotationLabel,
}: PhysicalLayoutProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [effectiveOneU, setEffectiveOneU] = useState(oneU);

  // Calculate keyboard extent in layout units
  const rightMost = positions
    .map((k) => k.x + k.width)
    .reduce((a, b) => Math.max(a, b), 0);
  const bottomMost = positions
    .map((k) => k.y + k.height)
    .reduce((a, b) => Math.max(a, b), 0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const calculate = () => {
      if (zoom === "auto" && rightMost > 0 && bottomMost > 0) {
        const padding = 16;
        const availW = container.clientWidth - padding * 2;
        const availH = container.clientHeight - padding * 2;
        const fitOneU = Math.max(10, Math.min(
          availW / rightMost,
          availH / bottomMost,
        ));
        setEffectiveOneU(fitOneU);
      } else if (typeof zoom === "number") {
        setEffectiveOneU(oneU * zoom);
      } else {
        setEffectiveOneU(oneU);
      }
    };

    calculate();

    const resizeObserver = new ResizeObserver(calculate);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [zoom, oneU, rightMost, bottomMost]);

  const positionItems = positions.map((p, idx) => (
    <div className="absolute" key={p.id} style={scalePosition(p, effectiveOneU)}>
      <div
        onClick={() => onPositionClicked?.(idx)}
        className="hover:[transform:translateZ(100px)] transition-transform duration-200"
      >
        <Key
          oneU={effectiveOneU}
          selected={idx === selectedPosition}
          tooltipData={p.tooltipData}
          encoderRotationLabel={idx === ENCODER_POSITION ? encoderRotationLabel : undefined}
          onRecommendationClick={onRecommendationClick}
          onMoreClick={() => onPositionClicked?.(idx)}
          {...p}
        />
      </div>
    </div>
  ));

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      <div
        className="relative"
        style={{
          width: rightMost * effectiveOneU + "px",
          height: bottomMost * effectiveOneU + "px",
        }}
      >
        {positionItems}
      </div>
    </div>
  );
};
