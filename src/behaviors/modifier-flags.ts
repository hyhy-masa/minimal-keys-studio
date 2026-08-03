import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

export function getModifierFlags(
  binding: BehaviorBinding | null | undefined,
  behaviors: GetBehaviorDetailsResponse[],
): number {
  const behavior = binding
    ? behaviors.find((candidate) => candidate.id === binding.behaviorId)
    : undefined;
  return behavior?.displayName === "Key Press" && binding
    ? (binding.param1 >>> 24) & 0xff
    : 0;
}

export function replaceModifierFlags(
  binding: BehaviorBinding,
  modFlags: number,
): BehaviorBinding {
  return { ...binding, param1: (modFlags << 24) | (binding.param1 & 0x00ffffff) };
}

export function applyModifierFlags(
  binding: BehaviorBinding,
  modFlags: number,
  behaviors: GetBehaviorDetailsResponse[],
): BehaviorBinding {
  const behavior = behaviors.find((b) => b.id === binding.behaviorId);
  if (behavior?.displayName !== "Key Press") return binding;
  if ((binding.param1 >>> 24) !== 0) return binding;
  return replaceModifierFlags(binding, modFlags);
}
