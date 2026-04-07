export const DEFAULT_ONE_U = 56;
export const MIN_ONE_U = 20;
const DEFAULT_PADDING = 32;

/**
 * Compute the optimal oneU (pixels per keyboard unit) to fit
 * a keyboard layout within a container.
 *
 * Pure function — no DOM access, no side effects.
 * Safe to call with 0-sized containers or layouts (returns DEFAULT_ONE_U).
 */
export function computeOneU(
  containerWidth: number,
  containerHeight: number,
  layoutWidth: number,
  layoutHeight: number,
  padding: number = DEFAULT_PADDING,
): number {
  // Guard: invalid inputs → return safe default
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    layoutWidth <= 0 ||
    layoutHeight <= 0
  ) {
    return DEFAULT_ONE_U;
  }

  const availW = containerWidth - padding;
  const availH = containerHeight - padding;

  // Container too small even for padding
  if (availW <= 0 || availH <= 0) {
    return MIN_ONE_U;
  }

  const fitByWidth = availW / layoutWidth;
  const fitByHeight = availH / layoutHeight;

  return Math.max(MIN_ONE_U, Math.min(fitByWidth, fitByHeight));
}
