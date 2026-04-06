import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { hid_usage_page_and_id_from_usage } from "../hid-usages";
import { getUseCaseCategories, type UserOS } from "../behaviors/use-cases";
import { getBehaviorDescription } from "../behaviors/behavior-descriptions";
import { keyRoleMap, type KeyRecommendation } from "./key-roles";
import {
  getHidKeyDescription,
  getMouseKeyDescription,
  getBehaviorRoleName,
  ENCODER_POSITION,
  ENCODER_ADJUSTABLE_OPTIONS,
  type EncoderOption,
} from "./key-descriptions";

export type TooltipType = "simple" | "detail" | "encoder";

export interface TooltipData {
  type: TooltipType;
  roleName: string;
  description?: string;
  recommendations?: KeyRecommendation[];
  isEncoder?: boolean;
  encoderOptions?: EncoderOption[];
}

export function resolveTooltipData(
  binding: BehaviorBinding,
  behaviors: GetBehaviorDetailsResponse[],
  keyPosition: number,
  os: UserOS,
): TooltipData {
  const behavior = behaviors.find((b) => b.id === binding.behaviorId);
  const displayName = behavior?.displayName ?? "";

  // Encoder position — always show encoder tooltip
  if (keyPosition === ENCODER_POSITION) {
    const pressDesc = resolveBindingLabel(binding, behaviors, displayName, os);
    return {
      type: "encoder",
      roleName: pressDesc.roleName,
      description: pressDesc.description,
      isEncoder: true,
      encoderOptions: ENCODER_ADJUSTABLE_OPTIONS,
    };
  }

  // None — special message
  if (displayName === "None") {
    return {
      type: "detail",
      roleName: "無効",
      description: "キーを押しても何も起きません",
      recommendations: keyRoleMap[keyPosition]?.recommendations,
    };
  }

  // Transparent — special message
  if (displayName === "Transparent") {
    return {
      type: "detail",
      roleName: "透過",
      description: "下のレイヤーの設定をそのまま使います",
    };
  }

  // Non-Key-Press behaviors (layer, hold-tap, etc.) — detail with behavior description
  if (displayName !== "Key Press" && displayName !== "Mouse Key Press") {
    const desc = getBehaviorDescription(displayName);
    return {
      type: "detail",
      roleName: getBehaviorRoleName(displayName),
      description: desc.description,
      recommendations: keyRoleMap[keyPosition]?.recommendations,
    };
  }

  // Mouse Key Press
  if (displayName === "Mouse Key Press") {
    const mouseDesc = getMouseKeyDescription(binding.param1);
    return {
      type: "detail",
      roleName: mouseDesc.roleName,
      description: mouseDesc.description,
      recommendations: keyRoleMap[keyPosition]?.recommendations,
    };
  }

  // Key Press — try reverse lookup from use-cases, then key-descriptions
  const resolved = resolveBindingLabel(binding, behaviors, displayName, os);
  const role = keyRoleMap[keyPosition];

  // Has use-case match or recommendations → detail
  if (resolved.fromUseCase || role) {
    return {
      type: "detail",
      roleName: resolved.roleName,
      description: resolved.description,
      recommendations: role?.recommendations,
    };
  }

  // Simple letter/number key
  return {
    type: "simple",
    roleName: resolved.roleName,
    description: resolved.description,
  };
}

interface ResolvedLabel {
  roleName: string;
  description?: string;
  fromUseCase: boolean;
}

function resolveBindingLabel(
  binding: BehaviorBinding,
  _behaviors: GetBehaviorDetailsResponse[],
  displayName: string,
  os: UserOS,
): ResolvedLabel {
  // Try use-cases reverse lookup (match on param1 for Key Press)
  if (displayName === "Key Press") {
    const categories = getUseCaseCategories(os);
    for (const category of categories) {
      for (const item of category.items) {
        if (item.behaviorDisplayName === "Key Press" && item.param1 === binding.param1) {
          return { roleName: item.label, description: item.description, fromUseCase: true };
        }
      }
    }

    // Fallback to key-descriptions
    const [rawPage, id] = hid_usage_page_and_id_from_usage(binding.param1);
    const page = rawPage & 0xff;
    const desc = getHidKeyDescription(page, id);

    // Add modifier prefix to roleName if present
    const modFlags = rawPage >> 8;
    if (modFlags) {
      const parts: string[] = [];
      if (modFlags & 0x01) parts.push("Ctrl");
      if (modFlags & 0x02) parts.push("Shift");
      if (modFlags & 0x04) parts.push("Alt");
      if (modFlags & 0x08) parts.push("⌘");
      const prefix = parts.join("+") + "+";
      return {
        roleName: prefix + desc.roleName,
        description: desc.description,
        fromUseCase: false,
      };
    }

    return { roleName: desc.roleName, description: desc.description, fromUseCase: false };
  }

  // Non-key-press fallback
  const desc = getBehaviorDescription(displayName);
  return { roleName: desc.label, description: desc.description, fromUseCase: false };
}
