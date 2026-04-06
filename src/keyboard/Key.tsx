import { PropsWithChildren, useCallback, useRef, useState } from "react";
import BehaviorShortNames from "./behavior-short-names.json";
import { KeyTooltip } from "./KeyTooltip";
import type { TooltipData } from "./tooltip-data";

interface KeyProps {
  selected?: boolean;
  width: number;
  height: number;
  oneU: number;
  header?: string;
  onClick?: () => void;
  tooltipData?: TooltipData | null;
  encoderRotationLabel?: string;
  onRecommendationClick?: (rec: import("./key-roles").KeyRecommendation) => void;
  onMoreClick?: () => void;
}

interface BehaviorShortName {
  short?: string;
}

const MAX_HEADER_LENGTH = 9;
const shortNames: Record<string, BehaviorShortName> = BehaviorShortNames;
const HOVER_DELAY_MS = 200;
const HIDE_DELAY_MS = 200;

const shortenHeader = (header: string | undefined) => {
  if (typeof header === "undefined") {
    return "";
  }
  // Empty string is a valid header for behaviors where we don't want to see a header, which is falsy
  // So we use an undefined check here
  if (typeof shortNames[header]?.short !== "undefined") {
    return shortNames[header].short;
  } else if (header.length > MAX_HEADER_LENGTH) {
    const words = header.split(/[\s,-]+/);
    const lettersPerWord = Math.trunc(MAX_HEADER_LENGTH / words.length);
    return words.map((word) => word.substring(0, lettersPerWord)).join("");
  } else {
    return header;
  }
};

export const Key = ({
  selected = false,
  width,
  height,
  oneU,
  header,
  onClick,
  tooltipData,
  encoderRotationLabel,
  onRecommendationClick,
  onMoreClick,
  children,
}: PropsWithChildren<KeyProps>) => {
  const pixelWidth = width * oneU - 4;
  const pixelHeight = height * oneU - 4;
  const radius = Math.max(4, oneU * 0.08);

  const [showTooltip, setShowTooltip] = useState(false);
  const [anchorRect, setAnchorRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const cancelHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    cancelHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, HIDE_DELAY_MS);
  }, [cancelHideTimer]);

  const handleMouseEnter = useCallback(() => {
    cancelHideTimer();
    hoverTimerRef.current = setTimeout(() => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setAnchorRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      }
      setShowTooltip(true);
    }, HOVER_DELAY_MS);
  }, [cancelHideTimer]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    startHideTimer();
  }, [startHideTimer]);

  const handleClick = useCallback(() => {
    setShowTooltip(false);
    onClick?.();
  }, [onClick]);

  return (
    <>
      <button
        ref={buttonRef}
        className={`keycap group relative flex flex-col justify-center items-center cursor-pointer transition-all duration-150 text-sm border ${
          selected
            ? "bg-primary text-primary-content border-primary/30 shadow-[0_1px_2px_rgba(0,0,0,0.2)] scale-[0.97] ring-2 ring-primary/40"
            : "bg-white text-base-content border-gray-300 shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:scale-105 hover:-translate-y-0.5"
        }`}
        style={{
          width: `${pixelWidth}px`,
          height: `${pixelHeight}px`,
          fontSize: `${Math.max(12, oneU * 0.21)}px`,
          borderRadius: `${radius}px`,
        }}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={`absolute ${selected ? "text-primary-content" : "text-base-content"} opacity-70 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center`}
          style={{ fontSize: `${Math.max(12, oneU * 0.22)}px` }}
        >
          {shortenHeader(header)}
        </div>
        {children}
      </button>
      {showTooltip && !selected && tooltipData && (
        <KeyTooltip
          data={tooltipData}
          anchorRect={anchorRect}
          encoderRotationLabel={encoderRotationLabel}
          onTooltipMouseEnter={cancelHideTimer}
          onTooltipMouseLeave={startHideTimer}
          onRecommendationClick={(rec) => {
            setShowTooltip(false);
            onRecommendationClick?.(rec);
          }}
          onMoreClick={() => {
            setShowTooltip(false);
            onMoreClick?.();
          }}
        />
      )}
    </>
  );
};
