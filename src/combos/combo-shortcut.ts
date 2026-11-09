import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { UserOS } from "../behaviors/use-cases";
import { hid_usage_page_and_id_from_usage } from "../hid-usages";
import { getHidKeyDescription } from "../keyboard/key-descriptions";
import type { Binding } from "../proto/combos";

export interface ModifierName {
  mask: number;
  windows: string;
  mac: string;
}

/** Left-hand modifiers, in the order people say them: Ctrl+Shift+Alt+Win. */
export const LEFT_MODIFIERS: ModifierName[] = [
  { mask: 0x01, windows: "Ctrl", mac: "Ctrl" },
  { mask: 0x02, windows: "Shift", mac: "Shift" },
  { mask: 0x04, windows: "Alt", mac: "⌥ Option" },
  { mask: 0x08, windows: "Win", mac: "⌘ Cmd" },
];

// Right-hand modifiers have no chip, but a combo written outside this app
// can hold one, so they must still read correctly.
const RIGHT_MODIFIERS: ModifierName[] = [
  { mask: 0x10, windows: "右Ctrl", mac: "右Ctrl" },
  { mask: 0x20, windows: "右Shift", mac: "右Shift" },
  { mask: 0x40, windows: "右Alt", mac: "右Option" },
  { mask: 0x80, windows: "右Win", mac: "右Cmd" },
];

// The shared label table names these by their Shift glyph or a code, but in the
// combo editor the result line is the only readout, so "[" must not read "{".
const SYMBOL_KEY_NAMES: Record<number, string> = {
  47: "[",
  48: "]",
  50: "#",
};

/** Where a picked binding came from: a complete command, or a key to build on. */
export type PickSource = string | undefined;
const COMPLETE_COMMAND_SOURCE = "actions";

/**
 * Applies the chosen modifiers to a newly picked binding.
 * - A ショートカット preset is a finished command (F11, Ctrl+C): the chips must not change it.
 * - A key from the character tabs keeps its own modifier and adds the chips, so
 *   Ctrl then "!" equals "!" then Ctrl.
 * - Media keys and bare modifier keys are not something a modifier belongs on.
 */
export function mergePickedBinding(
  picked: Binding,
  flags: number,
  source: PickSource,
  behaviors: GetBehaviorDetailsResponse[],
): Binding {
  if (!isKeyPressBinding(picked, behaviors) || source === COMPLETE_COMMAND_SOURCE) return picked;
  const [rawPage, id] = hid_usage_page_and_id_from_usage(picked.param1);
  if ((rawPage & 0xff) !== 7 || (id >= 224 && id <= 231)) return picked;
  const own = (picked.param1 >>> 24) & 0xff;
  return { ...picked, param1: withModifiers(picked.param1, own | flags) };
}

/** Always unsigned: bit 31 is a flag, and a negative copy would look like an unsaved edit. */
export function withModifiers(param1: number, flags: number): number {
  return (((flags & 0xff) << 24) | (param1 & 0x00ffffff)) >>> 0;
}

export function isKeyPressBinding(
  binding: Binding | null | undefined,
  behaviors: GetBehaviorDetailsResponse[],
): binding is Binding {
  return !!binding && behaviors.find((b) => b.id === binding.behaviorId)?.displayName === "Key Press";
}

export function modifierNames(flags: number, os: UserOS): string[] {
  // Mac shortcuts read Cmd first and Shift last ("⌘+Shift+T"), as the picker's own presets do.
  const left = os === "mac"
    ? [0x08, 0x01, 0x04, 0x02].map((mask) => LEFT_MODIFIERS.find((m) => m.mask === mask)!)
    : LEFT_MODIFIERS;
  return [...left, ...RIGHT_MODIFIERS]
    .filter((m) => flags & m.mask)
    .map((m) => m[os]);
}

/** Modifiers then the key, e.g. ["Alt", "Enter"]. param1 may be negative: bit 31 is the right GUI flag. */
export function comboShortcutParts(param1: number, os: UserOS): string[] {
  const [rawPage, id] = hid_usage_page_and_id_from_usage(param1);
  const page = rawPage & 0xff;
  return [
    ...modifierNames((param1 >>> 24) & 0xff, os),
    (page === 7 && SYMBOL_KEY_NAMES[id]) || getHidKeyDescription(page, id, os).roleName,
  ];
}

export function comboShortcutLabel(param1: number, os: UserOS): string {
  return comboShortcutParts(param1, os).join(" + ");
}
