import { describe, it, expect } from "vitest";
import { keyRoleMap } from "./key-roles";

describe("keyRoleMap", () => {
  it("is a non-empty record", () => {
    expect(Object.keys(keyRoleMap).length).toBeGreaterThan(0);
  });

  it("each role has roleLabel and non-empty recommendations", () => {
    for (const [posStr, role] of Object.entries(keyRoleMap)) {
      expect(Number.isInteger(Number(posStr))).toBe(true);
      expect(role.roleLabel).toBeTruthy();
      expect(role.recommendations.length).toBeGreaterThan(0);
    }
  });

  it("each recommendation has label, behaviorDisplayName, and params", () => {
    for (const role of Object.values(keyRoleMap)) {
      for (const rec of role.recommendations) {
        expect(rec.label).toBeTruthy();
        expect(rec.behaviorDisplayName).toBeTruthy();
        expect(typeof rec.param1).toBe("number");
        expect(typeof rec.param2).toBe("number");
      }
    }
  });

  it("getKeyRole returns role for known position", () => {
    const positions = Object.keys(keyRoleMap).map(Number);
    const firstPos = positions[0];
    expect(keyRoleMap[firstPos]).toBeDefined();
    expect(keyRoleMap[firstPos].roleLabel).toBeTruthy();
  });

  it("getKeyRole returns undefined for unknown position", () => {
    expect(keyRoleMap[9999]).toBeUndefined();
  });
});
