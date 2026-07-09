import { describe, it, expect } from "vitest";
import {
  reduce,
  run,
  initialState,
  semverGe,
  TOOL_VERSION,
  type Manifest,
  type WizardEvent,
} from "./machine";

const plain: Manifest = { schema: 2, version: "v1.0.0", requires_settings_reset: false };
const gatt: Manifest = { schema: 2, version: "v2.0.0", requires_settings_reset: true };
const tooNew: Manifest = {
  schema: 2,
  version: "v9.0.0",
  requires_settings_reset: false,
  min_tool_version: "1.0.0",
};

const toRFlashed = (m: Manifest): WizardEvent[] => [
  { type: "START" },
  { type: "FETCH_OK", manifest: m },
  { type: "PROCEED" },
  { type: "DOWNLOAD_OK" },
  { type: "CONFIRM_R" },
  { type: "BOOTLOADER_R" },
  { type: "FLASH_R_OK" },
];

describe("wizard reducer", () => {
  it("happy path (no settings_reset) reaches done", () => {
    const s = run([
      ...toRFlashed(plain),
      { type: "SWAP_DONE" },
      { type: "CONFIRM_L" },
      { type: "BOOTLOADER_L" },
      { type: "FLASH_L_OK" },
      { type: "CHECKLIST_OK" },
    ]);
    expect(s.step).toBe("done");
  });

  it("settings_reset release is hard-blocked in-app", () => {
    const s = run([{ type: "START" }, { type: "FETCH_OK", manifest: gatt }, { type: "PROCEED" }]);
    expect(s.step).toBe("blocked");
    expect(s.step === "blocked" && s.reason).toBe("settings_reset_unsupported");
  });

  it("a tool older than min_tool_version is blocked at fetch", () => {
    const s = run([{ type: "START" }, { type: "FETCH_OK", manifest: tooNew }]);
    expect(s.step).toBe("blocked");
    expect(s.step === "blocked" && s.reason).toBe("tool_too_old");
  });

  it("a satisfied min_tool_version proceeds to show_release", () => {
    const ok: Manifest = { ...plain, min_tool_version: TOOL_VERSION };
    const s = run([{ type: "START" }, { type: "FETCH_OK", manifest: ok }]);
    expect(s.step).toBe("show_release");
  });

  it("cannot reach L before R is flashed (ordering is structural)", () => {
    const s = run([
      { type: "START" },
      { type: "FETCH_OK", manifest: plain },
      { type: "PROCEED" },
      { type: "DOWNLOAD_OK" }, // at r_confirm
      { type: "CONFIRM_L" }, // wrong-half events: ignored
      { type: "BOOTLOADER_L" },
      { type: "FLASH_L_OK" },
    ]);
    expect(s.step).toBe("r_confirm");
  });

  it("R flash error goes to error with provenance", () => {
    const s = run([...toRFlashed(plain).slice(0, -1), { type: "FLASH_R_ERR", message: "boom" }]);
    expect(s.step).toBe("error");
    expect(s.step === "error" && s.from).toBe("r_flashing");
  });

  it("failed verify checklist routes to recovery", () => {
    const s = run([
      ...toRFlashed(plain),
      { type: "SWAP_DONE" },
      { type: "CONFIRM_L" },
      { type: "BOOTLOADER_L" },
      { type: "FLASH_L_OK" },
      { type: "CHECKLIST_FAIL" },
    ]);
    expect(s.step).toBe("recovery");
  });

  it("ENTER_RECOVERY is reachable from a mid-flow state", () => {
    const mid = run(toRFlashed(plain));
    expect(mid.step).toBe("swap_to_l");
    expect(reduce(mid, { type: "ENTER_RECOVERY" }).step).toBe("recovery");
  });

  it("RESET returns to idle from anywhere", () => {
    const mid = run(toRFlashed(plain));
    expect(reduce(mid, { type: "RESET" })).toEqual(initialState);
  });

  it("unknown event in a state is a no-op", () => {
    const s0 = run([{ type: "START" }, { type: "FETCH_OK", manifest: plain }]);
    const s1 = reduce(s0, { type: "FLASH_R_OK" });
    expect(s1).toEqual(s0);
  });
});

describe("semverGe", () => {
  it("compares numeric components", () => {
    expect(semverGe("1.0.0", "1.0.0")).toBe(true);
    expect(semverGe("0.2.0", "0.1.9")).toBe(true);
    expect(semverGe("0.1.0", "1.0.0")).toBe(false); // the self-block trap
    expect(semverGe("1.2.3-beta", "1.2.3")).toBe(true);
  });
});
