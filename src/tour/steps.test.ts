import { describe, it, expect } from "vitest";
import { TOUR_SELECTORS, buildTourSteps } from "./steps";

const TAB_IDS = [
  "keymap",
  "holdtap",
  "encoder",
  "combo",
  "trackball",
  "bluetooth",
  "battery",
  "settings",
];

describe("TOUR_SELECTORS", () => {
  it("builds data-tour attribute selectors", () => {
    expect(TOUR_SELECTORS.keymapArea).toBe("[data-tour='keymap-area']");
    expect(TOUR_SELECTORS.tab("keymap")).toBe("[data-tour='tab-keymap']");
  });
});

describe("buildTourSteps", () => {
  const steps = buildTourSteps();

  it("has 17 steps", () => {
    expect(steps).toHaveLength(17);
  });

  it("first and last steps are element-less (centered popovers)", () => {
    expect(steps[0].element).toBeUndefined();
    expect(steps[steps.length - 1].element).toBeUndefined();
  });

  it("all middle steps target data-tour selectors", () => {
    for (const step of steps.slice(1, -1)) {
      expect(step.element).toMatch(/^\[data-tour='[a-z-]+'\]$/);
    }
  });

  it("introduces all 8 tabs exactly once each", () => {
    const elements = steps.map((s) => s.element);
    for (const id of TAB_IDS) {
      expect(
        elements.filter((e) => e === `[data-tour='tab-${id}']`)
      ).toHaveLength(1);
    }
  });

  it("every step has a non-empty Japanese title and description", () => {
    for (const step of steps) {
      expect(step.popover?.title).toBeTruthy();
      expect(step.popover?.description).toBeTruthy();
    }
  });

  it("mentions the re-run entry point in the closing step", () => {
    const last = steps[steps.length - 1];
    expect(last.popover?.description).toContain("使い方を見る");
  });
});
