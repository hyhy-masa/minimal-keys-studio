import { describe, expect, it } from "vitest";
import {
  checkForUpdate,
  compareVersions,
  shouldNotifyForRelease,
} from "./versionCheck";

describe("compareVersions", () => {
  it("accepts versions with or without a leading v", () => {
    expect(compareVersions("v0.5.0", "0.4.0")).toBe(1);
  });

  it("compares numeric segments rather than strings", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
  });
});

describe("shouldNotifyForRelease", () => {
  const currentVersion = "0.4.0";

  it("does not notify for the same or an older version", () => {
    expect(
      shouldNotifyForRelease({ tagName: "v0.4.0" }, currentVersion)
    ).toBe(false);
    expect(
      shouldNotifyForRelease({ tagName: "v0.3.9" }, currentVersion)
    ).toBe(false);
  });

  it("does not notify for draft or prerelease releases", () => {
    expect(
      shouldNotifyForRelease({ tagName: "v0.5.0", draft: true }, currentVersion)
    ).toBe(false);
    expect(
      shouldNotifyForRelease(
        { tagName: "v0.5.0", prerelease: true },
        currentVersion
      )
    ).toBe(false);
  });

  it("does not notify for a version already shown", () => {
    expect(
      shouldNotifyForRelease(
        { tagName: "v0.5.0" },
        currentVersion,
        "v0.5.0"
      )
    ).toBe(false);
  });

  it("notifies for a newer stable version that has not been shown", () => {
    expect(
      shouldNotifyForRelease({ tagName: "v0.5.0" }, currentVersion)
    ).toBe(true);
  });
});

describe("checkForUpdate", () => {
  it("returns no update when the request fails", async () => {
    await expect(
      checkForUpdate("0.4.0", async () => {
        throw new Error("offline");
      })
    ).resolves.toBeNull();
  });
});
