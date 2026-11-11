import { describe, expect, it } from "vitest";
import * as _m0 from "protobufjs/minimal";
import * as Macros from "./macros";
import { parseRequest, FakeMacroFirmware, errorBytes } from "../test/fakeMacroFirmware";

const steps = (n: number, value = 0x070004): Macros.Step[] =>
  Array.from({ length: n }, (_, i) => ({ type: Macros.STEP_TAP, value: value + (i % 26) }));

describe("macros codec — requests", () => {
  it("get_info is an empty field-1 message", () => {
    expect([...Macros.encodeGetInfo()]).toEqual([10, 0]);
  });

  it("get_macro carries index and offset", () => {
    const r = parseRequest(Macros.encodeGetMacro(3, 32));
    expect(r.kind).toBe("get_macro");
    expect(r.fields.get(1)).toBe(3);
    expect(r.fields.get(2)).toBe(32);
  });

  it("commit and delete of slot 0 still select their oneof field", () => {
    expect(parseRequest(Macros.encodeCommit(0)).kind).toBe("commit");
    expect(parseRequest(Macros.encodeDelete(0)).kind).toBe("delete");
    expect(parseRequest(Macros.encodeDelete(5)).fields.get(1)).toBe(5);
  });

  it("begin_set round-trips name (UTF-8), timing and step count", () => {
    const r = parseRequest(
      Macros.encodeBeginSet({ index: 2, name: "メール", tapMs: 60, waitMs: 80, stepCount: 19 }),
    );
    expect(r.kind).toBe("begin_set");
    expect(r.fields.get(1)).toBe(2);
    expect(r.fields.get(2)).toBe("メール");
    expect(r.fields.get(3)).toBe(60);
    expect(r.fields.get(4)).toBe(80);
    expect(r.fields.get(5)).toBe(19);
  });

  it("append_steps keeps values with bit 31 set as unsigned", () => {
    const sent = [
      { type: Macros.STEP_TAP, value: 0xff07002a },
      { type: Macros.STEP_WAIT, value: 10000 },
      { type: Macros.STEP_PRESS, value: 0x020700e1 },
    ];
    const r = parseRequest(Macros.encodeAppendSteps(1, 8, sent));
    expect(r.kind).toBe("append_steps");
    expect(r.fields.get(2)).toBe(8);
    expect(r.steps).toEqual(sent);
  });

  it("worst-case requests stay within the 128-byte firmware payload limit", () => {
    const name32 = "あいうえおかきくけこ" + "ab"; // 30 + 2 = 32 bytes
    expect(new TextEncoder().encode(name32).length).toBe(32);
    const begin = Macros.encodeBeginSet({ index: 31, name: name32, tapMs: 500, waitMs: 1000, stepCount: 128 });
    const append = Macros.encodeAppendSteps(
      31,
      120,
      Array.from({ length: 8 }, () => ({ type: Macros.STEP_TAP, value: 0xff07002a })),
    );
    expect(begin.length).toBeLessThanOrEqual(Macros.REQUEST_PAYLOAD_MAX_BYTES);
    expect(append.length).toBeLessThanOrEqual(Macros.REQUEST_PAYLOAD_MAX_BYTES);
    const maxValue = Macros.encodeAppendSteps(
      0xffff,
      0xffff,
      Array.from({ length: 8 }, () => ({ type: 0xff, value: 0xffffffff })),
    );
    expect(maxValue.length).toBeLessThanOrEqual(Macros.REQUEST_PAYLOAD_MAX_BYTES);
  });
});

describe("macros codec — chunking", () => {
  it.each([
    [0, []],
    [1, [1]],
    [8, [8]],
    [9, [8, 1]],
    [128, Array(16).fill(8)],
  ])("%i steps split into chunks of %j", (n, sizes) => {
    const chunks = Macros.chunkSteps(steps(n));
    expect(chunks.map((c) => c.steps.length)).toEqual(sizes);
    expect(chunks.map((c) => c.offset)).toEqual(sizes.map((_, i) => i * 8));
    expect(chunks.flatMap((c) => c.steps)).toEqual(steps(n));
  });

  it("the write sequence is begin_set, append_steps in order, commit", () => {
    const seq = Macros.encodeWriteSequence({ index: 4, name: "x", tapMs: 30, waitMs: 40, steps: steps(17) });
    const parsed = seq.map(parseRequest);
    expect(parsed.map((r) => r.kind)).toEqual(["begin_set", "append_steps", "append_steps", "append_steps", "commit"]);
    expect(parsed.slice(1, 4).map((r) => r.fields.get(2) ?? 0)).toEqual([0, 8, 16]);
    expect(parsed.every((r) => r.bytes <= Macros.REQUEST_PAYLOAD_MAX_BYTES)).toBe(true);
  });
});

describe("macros codec — responses", () => {
  it("decodes get_info including the macro list", async () => {
    const fw = new FakeMacroFirmware();
    fw.maxMacros = 8;
    fw.macros.set(0, { name: "a", tapMs: 30, waitMs: 40, steps: steps(3) });
    fw.macros.set(5, { name: "b", tapMs: 30, waitMs: 40, steps: steps(10) });
    const resp = Macros.decodeResponse(await fw.handle(Macros.encodeGetInfo()));
    expect(resp.info).toMatchObject({
      version: 1,
      maxMacros: 8,
      maxStepsPerMacro: 128,
      totalSteps: 512,
      usedSteps: 13,
      nameMaxBytes: 32,
      macros: [
        { index: 0, stepCount: 3 },
        { index: 5, stepCount: 10 },
      ],
    });
  });

  it("fills absent limits with the firmware defaults", () => {
    const resp = Macros.decodeResponse(new Uint8Array([18, 2, 8, 1]));
    expect(resp.info).toMatchObject({ version: 1, maxMacros: 16, maxStepsPerMacro: 128, totalSteps: 512, nameMaxBytes: 32 });
  });

  it("decodes get_macro with name, timing and the step page", async () => {
    const fw = new FakeMacroFirmware();
    fw.macros.set(2, { name: "列幅", tapMs: 60, waitMs: 80, steps: [...steps(20), { type: 4, value: 300 }] });
    const resp = Macros.decodeResponse(await fw.handle(Macros.encodeGetMacro(2, 16)));
    expect(resp.macro).toMatchObject({ index: 2, name: "列幅", tapMs: 60, waitMs: 80, stepCount: 21, offset: 16 });
    expect(resp.macro?.steps).toHaveLength(5);
    expect(resp.macro?.steps[4]).toEqual({ type: 4, value: 300 });
  });

  it("decodes an error with its code and an ok with used steps", () => {
    expect(Macros.decodeResponse(errorBytes(3, "no space")).error).toEqual({ code: 3, message: "no space" });
    const ok = _m0.Writer.create().uint32(34).bytes(_m0.Writer.create().uint32(8).uint32(42).finish()).finish();
    expect(Macros.decodeResponse(ok).ok).toEqual({ usedSteps: 42 });
  });

  it("skips unknown response fields and unknown fields inside a step", () => {
    const step = _m0.Writer.create().uint32(8).uint32(1).uint32(16).uint32(5).uint32(24).uint32(99).finish();
    const macro = _m0.Writer.create().uint32(40).uint32(1).uint32(58).bytes(step).uint32(80).uint32(7).finish();
    const data = _m0.Writer.create().uint32(26).bytes(macro).uint32(98).bytes(new Uint8Array([1, 2])).finish();
    const resp = Macros.decodeResponse(data);
    expect(resp.macro?.steps).toEqual([{ type: 1, value: 5 }]);
  });

  it("has a Japanese message for every firmware error code", () => {
    const codes = [1, 2, 3, 4, 5, 6, 7];
    const messages = codes.map(Macros.errorMessage);
    expect(new Set(messages).size).toBe(codes.length);
    for (const m of messages) expect(m).toMatch(/[ぁ-んァ-ン]/);
    expect(Macros.errorMessage(3)).toContain("空き");
    expect(Macros.errorMessage(99)).toContain("99");
  });
});
