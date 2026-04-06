import {
  PhysicalLayout,
  Keymap as KeymapMsg,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { resolveBehaviorId } from "../behaviors/resolve-behavior";
import type { KeyRecommendation } from "./key-roles";

import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "./PhysicalLayout";
import { HidUsageLabel } from "./HidUsageLabel";
import { resolveTooltipData } from "./tooltip-data";
import { detectOS } from "../behaviors/use-cases";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

export interface KeymapProps {
  layout: PhysicalLayout;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  onKeyPositionClicked: (keyPosition: number) => void;
  onBindingApply?: (binding: BehaviorBinding) => void;
  encoderRotationLabel?: string;
}

export const Keymap = ({
  layout,
  keymap,
  behaviors,
  scale,
  selectedLayerIndex,
  selectedKeyPosition,
  onKeyPositionClicked,
  onBindingApply,
  encoderRotationLabel,
}: KeymapProps) => {
  if (!keymap.layers[selectedLayerIndex]) {
    return <></>;
  }

  const behaviorList = Object.values(behaviors);
  const os = detectOS();

  const handleRecommendationClick = (rec: KeyRecommendation) => {
    const behaviorId = resolveBehaviorId(rec.behaviorDisplayName, behaviorList);
    if (behaviorId !== undefined && onBindingApply) {
      onBindingApply({ behaviorId, param1: rec.param1, param2: rec.param2 });
    }
  };

  const positions = layout.keys.map((k, i) => {
    if (i >= keymap.layers[selectedLayerIndex].bindings.length) {
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: "Unknown",
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        children: <span></span>,
        tooltipData: null,
      };
    }

    const binding = keymap.layers[selectedLayerIndex].bindings[i];

    return {
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header:
        behaviors[binding.behaviorId]?.displayName || "Unknown",
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children: (
        <HidUsageLabel
          hid_usage={binding.param1}
        />
      ),
      tooltipData: resolveTooltipData(binding, behaviorList, i, os),
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      oneU={48}
      hoverZoom={true}
      zoom={scale}
      selectedPosition={selectedKeyPosition}
      onPositionClicked={onKeyPositionClicked}
      onRecommendationClick={handleRecommendationClick}
      encoderRotationLabel={encoderRotationLabel}
    />
  );
};
