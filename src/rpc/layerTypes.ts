/**
 * Shape of a keymap layer as presented in the UI.
 *
 * Extracted so that the layer-loading hook and the components that consume it
 * can be written against the same type. `id` is the firmware-side layer id,
 * `index` is the position in the keymap, and `name` falls back to `Layer <n>`
 * when the firmware reports no name.
 */
export interface LayerDisplay {
  id: number;
  index: number;
  name: string;
}
