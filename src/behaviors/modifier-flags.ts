import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

export function applyModifierFlags(
  binding: BehaviorBinding,
  modFlags: number,
  behaviors: GetBehaviorDetailsResponse[],
): BehaviorBinding {
  const behavior = behaviors.find((b) => b.id === binding.behaviorId);
  if (behavior?.displayName !== "Key Press") return binding;
  return { ...binding, param1: (modFlags << 24) | (binding.param1 & 0x00ffffff) };
}
