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
import { getHidKeyDescription, getMouseKeyDescription } from "./key-descriptions";
import { hid_usage_page_and_id_from_usage } from "../hid-usages";
import type { ReactNode } from "react";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

// Modifier bitmask → short label
function modifierLabel(param1: number): string {
  const mods: string[] = [];
  if (param1 & 0x01) mods.push("Ctrl");
  if (param1 & 0x02) mods.push("Shift");
  if (param1 & 0x04) mods.push("Alt");
  if (param1 & 0x08) mods.push("⌘");
  return mods.join("+") || `Mod${param1}`;
}

// Get readable label for a HID usage param
function hidParamLabel(param: number): string {
  const [rawPage, id] = hid_usage_page_and_id_from_usage(param);
  const page = rawPage & 0xff;
  const desc = getHidKeyDescription(page, id);
  return desc.roleName;
}

// Generate smart header + children based on behavior type
function getKeyDisplay(
  binding: BehaviorBinding,
  displayName: string,
): { header: string; children: ReactNode } {
  switch (displayName) {
    case "Key Press":
      return { header: "", children: <HidUsageLabel hid_usage={binding.param1} /> };

    case "Layer-Tap":
      // param1 = layer, param2 = tap key
      return {
        header: `L${binding.param1}`,
        children: <span>{hidParamLabel(binding.param2)}</span>,
      };

    case "Mod-Tap":
      // param1 = modifier, param2 = tap key
      return {
        header: modifierLabel(binding.param1),
        children: <span>{hidParamLabel(binding.param2)}</span>,
      };

    case "Hold-Tap":
      // param1 = hold behavior param, param2 = tap behavior param
      return {
        header: "Hold/Tap",
        children: <span>{hidParamLabel(binding.param2)}</span>,
      };

    case "Momentary Layer":
      return {
        header: "MLayer",
        children: <span>L{binding.param1}</span>,
      };

    case "Toggle Layer":
      return {
        header: "Toggle",
        children: <span>L{binding.param1}</span>,
      };

    case "To Layer":
      return {
        header: "To",
        children: <span>L{binding.param1}</span>,
      };

    case "Sticky Layer":
      return {
        header: "Sticky",
        children: <span>L{binding.param1}</span>,
      };

    case "Sticky Key": {
      const modLabel = modifierLabel(binding.param1);
      return {
        header: "Sticky",
        children: <span>{modLabel}</span>,
      };
    }

    case "Mouse Key Press": {
      const mouseDesc = getMouseKeyDescription(binding.param1);
      return {
        header: "",
        children: <span>{mouseDesc.roleName}</span>,
      };
    }

    case "Bluetooth":
      return {
        header: "BT",
        children: <span>{binding.param1}</span>,
      };

    case "None":
      return { header: "None", children: <span></span> };

    case "Transparent":
      return { header: "Trans", children: <span></span> };

    default:
      // Fallback: show shortened name + param1 as HID
      return {
        header: displayName,
        children: binding.param1 ? <HidUsageLabel hid_usage={binding.param1} /> : <span></span>,
      };
  }
}

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
    const displayName = behaviors[binding.behaviorId]?.displayName || "Unknown";
    const { header, children } = getKeyDisplay(binding, displayName);

    return {
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header,
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children,
      tooltipData: resolveTooltipData(binding, behaviorList, i, os),
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      oneU={56}
      hoverZoom={true}
      zoom={scale}
      selectedPosition={selectedKeyPosition}
      onPositionClicked={onKeyPositionClicked}
      onRecommendationClick={handleRecommendationClick}
      encoderRotationLabel={encoderRotationLabel}
    />
  );
};
