import { describe, it, expect } from "vitest";
import { computeOneU, DEFAULT_ONE_U, MIN_ONE_U } from "./compute-one-u";

describe("computeOneU", () => {
  // Layout: 13 units wide, 4 units tall (typical minimal-keys)
  const layoutW = 13;
  const layoutH = 4;

  it("fits keyboard in container (width constrained)", () => {
    // Wide keyboard in a not-so-wide container
    const oneU = computeOneU(800, 600, layoutW, layoutH);
    // Available: 800-32=768 wide, 600-32=568 tall
    // Width-constrained: 768/13 ≈ 59
    // Height-constrained: 568/4 = 142
    // min(59, 142) = 59
    expect(oneU).toBeCloseTo(59.08, 0);
    // Verify keyboard fits: 13 * 59 = 767 < 768
    expect(layoutW * oneU).toBeLessThanOrEqual(768);
  });

  it("fits keyboard in container (height constrained)", () => {
    // Very short container
    const oneU = computeOneU(1200, 200, layoutW, layoutH);
    // Available: 1168 wide, 168 tall
    // Width: 1168/13 ≈ 89.8
    // Height: 168/4 = 42
    // min(89.8, 42) = 42
    expect(oneU).toBe(42);
    expect(layoutH * oneU).toBeLessThanOrEqual(168);
  });

  it("returns default when container width is 0", () => {
    expect(computeOneU(0, 600, layoutW, layoutH)).toBe(DEFAULT_ONE_U);
  });

  it("returns default when container height is 0", () => {
    expect(computeOneU(800, 0, layoutW, layoutH)).toBe(DEFAULT_ONE_U);
  });

  it("returns default when both container dimensions are 0", () => {
    expect(computeOneU(0, 0, layoutW, layoutH)).toBe(DEFAULT_ONE_U);
  });

  it("returns default when layout width is 0", () => {
    expect(computeOneU(800, 600, 0, layoutH)).toBe(DEFAULT_ONE_U);
  });

  it("returns default when layout height is 0", () => {
    expect(computeOneU(800, 600, layoutW, 0)).toBe(DEFAULT_ONE_U);
  });

  it("returns minimum when container is very small", () => {
    const oneU = computeOneU(50, 50, layoutW, layoutH);
    // Available: 18 wide, 18 tall
    // Width: 18/13 ≈ 1.38
    // Height: 18/4 = 4.5
    // min(1.38, 4.5) = 1.38 → clamped to MIN_ONE_U
    expect(oneU).toBe(MIN_ONE_U);
  });

  it("respects custom padding", () => {
    const withPadding = computeOneU(800, 600, layoutW, layoutH, 100);
    const withoutPadding = computeOneU(800, 600, layoutW, layoutH, 0);
    expect(withPadding).toBeLessThan(withoutPadding);
  });

  it("scales proportionally with container size", () => {
    const small = computeOneU(800, 600, layoutW, layoutH);
    const large = computeOneU(1600, 1200, layoutW, layoutH);
    // Double the container → roughly double the oneU
    expect(large).toBeGreaterThan(small * 1.5);
  });
});
