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
