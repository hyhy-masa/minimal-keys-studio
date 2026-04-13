import { describe, it, expect } from "vitest";
import { getUseCaseCategories } from "./use-cases";

describe("getUseCaseCategories", () => {
  it("returns an array of categories", () => {
    const categories = getUseCaseCategories("mac");
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThanOrEqual(3);
  });

  it("each category has id, label, and non-empty items", () => {
    for (const cat of getUseCaseCategories("mac")) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.items.length).toBeGreaterThan(0);
    }
  });

  it("each item has label, description, behaviorDisplayName, and params", () => {
    for (const cat of getUseCaseCategories("mac")) {
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
    const categories = getUseCaseCategories("mac");
    const common = categories.find((c) => c.id === "common-actions");
    expect(common).toBeDefined();
    const labels = common!.items.map((i) => i.label);
    expect(labels).toContain("コピーする");
    expect(labels).toContain("貼り付ける");
    expect(labels).toContain("元に戻す");
  });

  it("windows mode uses Ctrl shortcuts", () => {
    const categories = getUseCaseCategories("windows");
    const common = categories.find((c) => c.id === "common-actions");
    const copy = common!.items.find((i) => i.label === "コピーする");
    expect(copy).toBeDefined();
    // Windows copy description should mention Ctrl
    expect(copy!.description).toContain("Ctrl");
  });
});
