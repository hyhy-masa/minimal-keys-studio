/**
 * minimal-keys keyboard physical layout definition
 * 43-key split keyboard with trackball (right) and rotary encoder (left)
 *
 * Layout based on minimal-keys.dtsi from:
 * https://github.com/hyhy-masa/minimal-keys-release
 */

import type { KeyPosition } from "./PhysicalLayout";

/**
 * 43 key positions matching the physical_layout_0 in minimal-keys.dtsi
 * All keys are 100x100 units (1u), coordinates in centiunits.
 *
 * Row 0 (y=0):   10 keys - 5 left + gap + 5 right
 * Row 1 (y=100): 12 keys - 6 left + gap + 6 right
 * Row 2 (y=200): 12 keys - 6 left + gap + 6 right
 * Row 3 (y=300):  9 keys - 6 left + gap + 2 right + 1 far-right
 */
export const MINIMAL_KEYS_POSITIONS: KeyPosition[] = [
  // Row 0 (y=0) - 10 keys
  { id: "k0", width: 100, height: 100, x: 0, y: 0 },
  { id: "k1", width: 100, height: 100, x: 100, y: 0 },
  { id: "k2", width: 100, height: 100, x: 200, y: 0 },
  { id: "k3", width: 100, height: 100, x: 300, y: 0 },
  { id: "k4", width: 100, height: 100, x: 400, y: 0 },
  { id: "k5", width: 100, height: 100, x: 800, y: 0 },
  { id: "k6", width: 100, height: 100, x: 900, y: 0 },
  { id: "k7", width: 100, height: 100, x: 1000, y: 0 },
  { id: "k8", width: 100, height: 100, x: 1100, y: 0 },
  { id: "k9", width: 100, height: 100, x: 1200, y: 0 },

  // Row 1 (y=100) - 12 keys
  { id: "k10", width: 100, height: 100, x: 0, y: 100 },
  { id: "k11", width: 100, height: 100, x: 100, y: 100 },
  { id: "k12", width: 100, height: 100, x: 200, y: 100 },
  { id: "k13", width: 100, height: 100, x: 300, y: 100 },
  { id: "k14", width: 100, height: 100, x: 400, y: 100 },
  { id: "k15", width: 100, height: 100, x: 500, y: 100 },
  { id: "k16", width: 100, height: 100, x: 700, y: 100 },
  { id: "k17", width: 100, height: 100, x: 800, y: 100 },
  { id: "k18", width: 100, height: 100, x: 900, y: 100 },
  { id: "k19", width: 100, height: 100, x: 1000, y: 100 },
  { id: "k20", width: 100, height: 100, x: 1100, y: 100 },
  { id: "k21", width: 100, height: 100, x: 1200, y: 100 },

  // Row 2 (y=200) - 12 keys
  { id: "k22", width: 100, height: 100, x: 0, y: 200 },
  { id: "k23", width: 100, height: 100, x: 100, y: 200 },
  { id: "k24", width: 100, height: 100, x: 200, y: 200 },
  { id: "k25", width: 100, height: 100, x: 300, y: 200 },
  { id: "k26", width: 100, height: 100, x: 400, y: 200 },
  { id: "k27", width: 100, height: 100, x: 500, y: 200 },
  { id: "k28", width: 100, height: 100, x: 700, y: 200 },
  { id: "k29", width: 100, height: 100, x: 800, y: 200 },
  { id: "k30", width: 100, height: 100, x: 900, y: 200 },
  { id: "k31", width: 100, height: 100, x: 1000, y: 200 },
  { id: "k32", width: 100, height: 100, x: 1100, y: 200 },
  { id: "k33", width: 100, height: 100, x: 1200, y: 200 },

  // Row 3 (y=300) - 9 keys
  { id: "k34", width: 100, height: 100, x: 0, y: 300 },
  { id: "k35", width: 100, height: 100, x: 100, y: 300 },
  { id: "k36", width: 100, height: 100, x: 200, y: 300 },
  { id: "k37", width: 100, height: 100, x: 300, y: 300 },
  { id: "k38", width: 100, height: 100, x: 400, y: 300 },
  { id: "k39", width: 100, height: 100, x: 500, y: 300 },
  { id: "k40", width: 100, height: 100, x: 700, y: 300 },
  { id: "k41", width: 100, height: 100, x: 800, y: 300 },
  { id: "k42", width: 100, height: 100, x: 1200, y: 300 },
];

export const MINIMAL_KEYS_KEY_COUNT = 43;

/** Default layer names for minimal-keys */
export const MINIMAL_KEYS_LAYER_NAMES = [
  "Default",
  "Symbols & Nav",
  "Numbers",
  "System & IME",
  "Bluetooth",
  "Reserved",
  "Mouse",
];
