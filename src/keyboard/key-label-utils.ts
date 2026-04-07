export function modifierSymbols(bitmask: number): string {
  const symbols: string[] = [];
  if (bitmask & 0x01) symbols.push("⌃");  // Ctrl
  if (bitmask & 0x02) symbols.push("⇧");  // Shift
  if (bitmask & 0x04) symbols.push("⌥");  // Alt
  if (bitmask & 0x08) symbols.push("⌘");  // Cmd
  return symbols.join("") || `Mod${bitmask}`;
}
