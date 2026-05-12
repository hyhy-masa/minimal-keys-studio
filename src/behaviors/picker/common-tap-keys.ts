// Shared tap key list for Layer-Tap and Mod-Tap param2 selection
export interface TapKeyItem {
  label: string;
  hidId: number;
  modifier?: number;
}

export const commonTapKeys: TapKeyItem[] = [
  // Special keys first (most common for thumb keys)
  { label: "Space", hidId: 44 },
  { label: "Enter", hidId: 40 },
  { label: "Tab", hidId: 43 },
  { label: "Esc", hidId: 41 },
  { label: "BS", hidId: 42 },
  { label: "Delete", hidId: 76 },
  // Letters
  ...Array.from({ length: 26 }, (_, i) => ({
    label: String.fromCharCode(65 + i),
    hidId: 4 + i,
  })),
  // Numbers
  ...Array.from({ length: 9 }, (_, i) => ({
    label: String(i + 1),
    hidId: 30 + i,
  })),
  { label: "0", hidId: 39 },
  // F-keys
  ...Array.from({ length: 12 }, (_, i) => ({
    label: `F${i + 1}`,
    hidId: 58 + i,
  })),
  // Symbols
  { label: "-", hidId: 45 },
  { label: "=", hidId: 46 },
  { label: "[", hidId: 47 },
  { label: "]", hidId: 48 },
  { label: "\\", hidId: 49 },
  { label: ";", hidId: 51 },
  { label: "'", hidId: 52 },
  { label: "`", hidId: 53 },
  { label: ",", hidId: 54 },
  { label: ".", hidId: 55 },
  { label: "/", hidId: 56 },
  // Shift symbols (US layout)
  { label: "!", hidId: 30, modifier: 0x02 },
  { label: "@", hidId: 31, modifier: 0x02 },
  { label: "#", hidId: 32, modifier: 0x02 },
  { label: "$", hidId: 33, modifier: 0x02 },
  { label: "%", hidId: 34, modifier: 0x02 },
  { label: "^", hidId: 35, modifier: 0x02 },
  { label: "&", hidId: 36, modifier: 0x02 },
  { label: "*", hidId: 37, modifier: 0x02 },
  { label: "(", hidId: 38, modifier: 0x02 },
  { label: ")", hidId: 39, modifier: 0x02 },
  { label: "_", hidId: 45, modifier: 0x02 },
  { label: "+", hidId: 46, modifier: 0x02 },
  { label: "{", hidId: 47, modifier: 0x02 },
  { label: "}", hidId: 48, modifier: 0x02 },
  { label: "|", hidId: 49, modifier: 0x02 },
  { label: ":", hidId: 51, modifier: 0x02 },
  { label: '"', hidId: 52, modifier: 0x02 },
  { label: "~", hidId: 53, modifier: 0x02 },
  { label: "<", hidId: 54, modifier: 0x02 },
  { label: ">", hidId: 55, modifier: 0x02 },
  { label: "?", hidId: 56, modifier: 0x02 },
  // Special keys
  { label: "Caps Lock", hidId: 57 },
  { label: "Insert", hidId: 73 },
  { label: "PrtSc", hidId: 70 },
  { label: "Scroll Lock", hidId: 71 },
  { label: "Pause", hidId: 72 },
  { label: "Menu", hidId: 101 },
  // Japanese IME
  { label: "LANG1", hidId: 144 },
  { label: "LANG2", hidId: 145 },
  { label: "変換", hidId: 138 },
  { label: "無変換", hidId: 139 },
];
