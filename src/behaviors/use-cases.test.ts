import { describe, it, expect } from "vitest";
import { useCaseCategories } from "./use-cases";

describe("useCaseCategories", () => {
  it("exports an array of categories", () => {
    expect(Array.isArray(useCaseCategories)).toBe(true);
    expect(useCaseCategories.length).toBeGreaterThanOrEqual(3);
  });

  it("each category has id, label, and non-empty items", () => {
    for (const cat of useCaseCategories) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.items.length).toBeGreaterThan(0);
    }
  });

  it("each item has label, description, behaviorDisplayName, and params", () => {
    for (const cat of useCaseCategories) {
      for (const item of cat.items) {
        expect(item.label).toBeTruthy();
        expect(item.description).toBeTruthy();
        expect(item.behaviorDisplayName).toBeTruthy();
        expect(typeof item.param1).toBe("number");
        expect(typeof item.param2).toBe("number");
      }
    }
  });

  it("common-actions category exists with copy/paste/undo", () => {
    const common = useCaseCategories.find((c) => c.id === "common-actions");
    expect(common).toBeDefined();
    const labels = common!.items.map((i) => i.label);
    expect(labels).toContain("コピーする");
    expect(labels).toContain("貼り付ける");
    expect(labels).toContain("元に戻す");
  });
});
