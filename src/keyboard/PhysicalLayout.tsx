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
  oneU: number,
): CSSProperties {
  const left = x * oneU;
  const top = y * oneU;
  let transformOrigin = undefined;
  let transform = undefined;
  const transformStyle = "preserve-3d";

  if (r) {
    const transformX = ((rx || x) - x) * oneU;
    const transformY = ((ry || y) - y) * oneU;
    transformOrigin = `${transformX}px ${transformY}px`;
    transform = `rotate(${r}deg)`;
  }

  return {
    top,
    left,
    transformOrigin,
    transform,
    transformStyle,
  };
}

export const PhysicalLayout = ({
  positions,
  selectedPosition,
  oneU = 128,
  zoom,
  onPositionClicked,
  onRecommendationClick,
  encoderRotationLabel,
}: PhysicalLayoutProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Calculate natural (unscaled) keyboard dimensions
  const rightMost = positions
    .map((k) => k.x + k.width)
    .reduce((a, b) => Math.max(a, b), 0);
  const bottomMost = positions
    .map((k) => k.y + k.height)
    .reduce((a, b) => Math.max(a, b), 0);

  const naturalWidth = rightMost * oneU;
  const naturalHeight = bottomMost * oneU;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const calculateScale = () => {
      if (zoom === "auto") {
        const padding = 16;
        const availableWidth = container.clientWidth - padding * 2;
        const availableHeight = container.clientHeight - padding * 2;
        const newScale = Math.min(
          availableWidth / naturalWidth,
          availableHeight / naturalHeight,
        );
        setScale(Math.max(0.1, newScale));
      } else {
        setScale(zoom || 1);
      }
    };

    calculateScale();

    const resizeObserver = new ResizeObserver(() => {
      calculateScale();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [zoom, naturalWidth, naturalHeight]);

  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;

  const positionItems = positions.map((p, idx) => (
    <div className="absolute" key={p.id} style={scalePosition(p, oneU)}>
      <div
        onClick={() => onPositionClicked?.(idx)}
        className="hover:[transform:translateZ(100px)] transition-transform duration-200"
      >
        <Key
          oneU={oneU}
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
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
        }}
        ref={ref}
      >
        <div
          style={{
            width: `${naturalWidth}px`,
            height: `${naturalHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            transformStyle: "preserve-3d",
          }}
        >
          {positionItems}
        </div>
      </div>
    </div>
  );
};
