import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { hid_usage_page_and_id_from_usage } from "../hid-usages";
import { getHidKeyDescription, getMouseKeyDescription } from "../keyboard/key-descriptions";
import { modifierSymbols } from "../keyboard/key-label-utils";

/**
 * Format a binding's parameters into a human-readable detail string.
 * Returns empty string if no meaningful detail can be shown.
 */
export function formatBindingDetail(
  displayName: string,
  binding: BehaviorBinding,
  layers: { id: number; index: number; name: string }[],
): string {
  switch (displayName) {
    case "Key Press": {
      if (!binding.param1) return "";
      const [rawPage, id] = hid_usage_page_and_id_from_usage(binding.param1);
      const page = rawPage & 0xff;
      return getHidKeyDescription(page, id).roleName;
    }
    case "Layer-Tap": {
      // ZMK layer binding param1 = layer index (0-based position in layers array)
      const layerName = layers[binding.param1]?.name ?? `L${binding.param1}`;
      const [rawPage, id] = hid_usage_page_and_id_from_usage(binding.param2);
      const page = rawPage & 0xff;
      const keyName = getHidKeyDescription(page, id).roleName;
      return `${layerName} + ${keyName}`;
    }
    case "Mod-Tap": {
      const mod = modifierSymbols(binding.param1);
      const [rawPage, id] = hid_usage_page_and_id_from_usage(binding.param2);
      const page = rawPage & 0xff;
      const keyName = getHidKeyDescription(page, id).roleName;
      return `${mod} + ${keyName}`;
    }
    case "Mouse Key Press": {
      return getMouseKeyDescription(binding.param1).roleName;
    }
    case "Momentary Layer":
    case "Toggle Layer":
    case "To Layer":
    case "Sticky Layer": {
      // ZMK layer binding param1 = layer index (0-based position in layers array)
      return layers[binding.param1]?.name ?? `L${binding.param1}`;
    }
    case "Sticky Key": {
      return modifierSymbols(binding.param1);
    }
    case "Hold-Tap": {
      if (!binding.param2) return "";
      const [rawPage, id] = hid_usage_page_and_id_from_usage(binding.param2);
      const page = rawPage & 0xff;
      return getHidKeyDescription(page, id).roleName;
    }
    case "Bluetooth": {
      const ops = ["BT_CLR", "BT_NXT", "BT_PRV", "BT_SEL 0", "BT_SEL 1", "BT_SEL 2", "BT_SEL 3", "BT_SEL 4"];
      return ops[binding.param1] ?? `BT ${binding.param1}`;
    }
    case "None":
    case "Transparent":
    case "Reset":
    case "Bootloader":
    case "Soft Off":
      return "";
    default:
      return "";
  }
}
