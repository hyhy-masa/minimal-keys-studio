import type { UserOS } from "../behaviors/use-cases";

interface ModifierDef {
  label: string;
  macLabel: string;
  winLabel: string;
  symbol: string;
  winSymbol: string;
  bitmask: number;
}

const modifiers: ModifierDef[] = [
  { label: "Shift", macLabel: "Shift", winLabel: "Shift", symbol: "⇧", winSymbol: "⇧", bitmask: 0x02 },
  { label: "Cmd", macLabel: "⌘ Cmd", winLabel: "Win", symbol: "⌘", winSymbol: "⊞", bitmask: 0x08 },
  { label: "Ctrl", macLabel: "Ctrl", winLabel: "Ctrl", symbol: "⌃", winSymbol: "⌃", bitmask: 0x01 },
  { label: "Alt", macLabel: "⌥ Option", winLabel: "Alt", symbol: "⌥", winSymbol: "Alt", bitmask: 0x04 },
];

interface ModifierPanelProps {
  modifierFlags: number;
  onModifierFlagsChanged: (flags: number) => void;
  osMode: UserOS;
}

export function ModifierPanel({ modifierFlags, onModifierFlagsChanged, osMode }: ModifierPanelProps) {
  const isActive = modifierFlags !== 0;

  const toggle = (bitmask: number) => {
    onModifierFlagsChanged(modifierFlags ^ bitmask);
  };

  return (
    <div className={`flex flex-col gap-1.5 p-2 rounded-lg transition-colors ${isActive ? "bg-primary/10 border border-primary/30" : ""}`}>
      <span className="text-xs font-medium text-base-content/60">修飾キー</span>
      <div className="grid grid-cols-2 gap-1">
        {modifiers.map((mod) => {
          const checked = (modifierFlags & mod.bitmask) !== 0;
          const label = osMode === "mac" ? mod.macLabel : mod.winLabel;
          return (
            <button
              key={mod.bitmask}
              className={`flex items-center gap-1 px-1.5 py-1 text-xs rounded border transition-all ${
                checked
                  ? "bg-primary text-primary-content border-primary font-medium"
                  : "bg-white border-base-300 hover:border-primary/30 hover:bg-primary/5 text-base-content"
              }`}
              onClick={() => toggle(mod.bitmask)}
            >
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      {isActive && (
        <button
          className="text-xs text-primary hover:underline self-start"
          onClick={() => onModifierFlagsChanged(0)}
        >
          クリア
        </button>
      )}
    </div>
  );
}
