import { describe, expect, it } from "vitest";
import * as Macros from "../proto/macros";
import { MacroRpcError, deleteMacro, failureMessage, readAll, readMacro, writeMacro } from "./macro-client";
import { FakeMacroFirmware } from "../test/fakeMacroFirmware";

const stepsOf = (n: number): Macros.Step[] =>
  Array.from({ length: n }, (_, i) => ({ type: Macros.STEP_TAP, value: 0x070004 + (i % 26) }));

describe("reading macros", () => {
  it("reads a 40-step macro with get_macro at offsets 0, 16 and 32", async () => {
    const fw = new FakeMacroFirmware();
    fw.macros.set(3, { name: "長い", tapMs: 30, waitMs: 40, steps: stepsOf(40) });
    const m = await readMacro(fw.handle, 3);
    expect(m.steps).toEqual(stepsOf(40));
    expect(m.name).toBe("長い");
    expect(fw.requests.map((r) => r.fields.get(2) ?? 0)).toEqual([0, 16, 32]);
  });

  it("readAll asks get_info first, then each listed macro", async () => {
    const fw = new FakeMacroFirmware();
    fw.macros.set(0, { name: "a", tapMs: 30, waitMs: 40, steps: stepsOf(2) });
    fw.macros.set(7, { name: "b", tapMs: 60, waitMs: 80, steps: stepsOf(16) });
    const { info, macros } = await readAll(fw.handle);
    expect(fw.kinds()).toEqual(["get_info", "get_macro", "get_macro"]);
    expect(info.usedSteps).toBe(18);
    expect(macros.map((m) => [m.index, m.name, m.steps.length])).toEqual([
      [0, "a", 2],
      [7, "b", 16],
    ]);
  });

  it("stops instead of looping when a page adds no steps", async () => {
    // A macro response with step_count 5 but no steps.
    const stalled = async () => new Uint8Array([26, 2, 40, 5]);
    await expect(readMacro(stalled, 0)).rejects.toThrow("stalled");
  });
});

describe("writing macros", () => {
  it("sends begin_set, append_steps in order and commit, and reports progress", async () => {
    const fw = new FakeMacroFirmware();
    const progress: string[] = [];
    await writeMacro(fw.handle, { index: 1, name: "x", tapMs: 30, waitMs: 40, steps: stepsOf(20) }, (d, t) =>
      progress.push(`${d}/${t}`),
    );
    expect(fw.kinds()).toEqual(["begin_set", "append_steps", "append_steps", "append_steps", "commit"]);
    expect(progress).toEqual(["1/5", "2/5", "3/5", "4/5", "5/5"]);
    expect(fw.macros.get(1)?.steps).toEqual(stepsOf(20));
    expect(fw.requests.every((r) => r.bytes <= Macros.REQUEST_PAYLOAD_MAX_BYTES)).toBe(true);
  });

  it("stops at the first error and throws its code", async () => {
    const fw = new FakeMacroFirmware();
    fw.failOn = (r) => (r.kind === "commit" ? Macros.ERR_NO_SPACE : undefined);
    const err = await writeMacro(fw.handle, { index: 0, name: "x", tapMs: 30, waitMs: 40, steps: stepsOf(3) }).catch((e) => e);
    expect(err).toBeInstanceOf(MacroRpcError);
    expect(err.code).toBe(Macros.ERR_NO_SPACE);
    expect(failureMessage(err)).toBe(Macros.errorMessage(Macros.ERR_NO_SPACE));
    expect(fw.macros.has(0)).toBe(false);
  });

  it("delete removes the slot", async () => {
    const fw = new FakeMacroFirmware();
    fw.macros.set(2, { name: "a", tapMs: 30, waitMs: 40, steps: stepsOf(1) });
    await deleteMacro(fw.handle, 2);
    expect(fw.macros.has(2)).toBe(false);
  });

  it("a thrown transport error gets the no-answer message", () => {
    expect(failureMessage(new Error("timeout"))).toContain("返事がありませんでした");
  });
});
