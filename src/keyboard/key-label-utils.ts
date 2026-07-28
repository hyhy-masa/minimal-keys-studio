export function modifierSymbols(bitmask: number): string {
  const symbols: string[] = [];
  // Left modifiers (bits 0-3)
  if (bitmask & 0x01) symbols.push("⌃");  // Left Ctrl
  if (bitmask & 0x02) symbols.push("⇧");  // Left Shift
  if (bitmask & 0x04) symbols.push("⌥");  // Left Alt
  if (bitmask & 0x08) symbols.push("⌘");  // Left Cmd
  // Right modifiers (bits 4-7)
  if (bitmask & 0x10) symbols.push("R⌃"); // Right Ctrl
  if (bitmask & 0x20) symbols.push("R⇧"); // Right Shift
  if (bitmask & 0x40) symbols.push("R⌥"); // Right Alt
  if (bitmask & 0x80) symbols.push("R⌘"); // Right Cmd
  return symbols.join("") || `Mod${bitmask}`;
}

const modifierUsageLabels: Record<number, string> = {
  224: "⌃",
  225: "⇧",
  226: "⌥",
  227: "⌘",
  228: "R⌃",
  229: "R⇧",
  230: "R⌥",
  231: "R⌘",
};

/** Formats a Mod-Tap/Sticky Key HID usage without treating its usage ID as a bitmask. */
export function formatModifierKeycode(param: number): string {
  const implicitModifiers = (param >>> 24) & 0xff;
  const prefix = implicitModifiers ? modifierSymbols(implicitModifiers) : "";
  const [rawPage, id] = hid_usage_page_and_id_from_usage(param);
  const page = rawPage & 0xff;
  const label = page === 7 && modifierUsageLabels[id]
    ? modifierUsageLabels[id]
    : getHidKeyDescription(page, id).roleName;
  return `${prefix}${label}`;
}
import { hid_usage_page_and_id_from_usage } from "../hid-usages";
import { getHidKeyDescription } from "./key-descriptions";
