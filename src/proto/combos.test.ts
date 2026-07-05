import { describe, it, expect } from "vitest";
import * as _m0 from "protobufjs/minimal";
import { decodeResponse } from "./combos";

interface ComboFixture {
  comboId: number;
  keyPositions: number[];
  timeoutMs: number;
}

// ComboConfig with key_positions encoded PACKED (field 2, wire type 2 — a
// length-delimited block of varints). This is how the firmware's nanopb encoder
// actually sends a `repeated uint32`.
function encodeComboConfigPacked(c: ComboFixture): Uint8Array {
  const w = _m0.Writer.create();
  if (c.comboId !== 0) w.uint32(8).uint32(c.comboId);
  if (c.keyPositions.length) {
    w.uint32(18).fork();
    for (const p of c.keyPositions) w.uint32(p);
    w.ldelim();
  }
  if (c.timeoutMs !== 0) w.uint32(24).uint32(c.timeoutMs);
  return w.finish();
}

// ComboConfig with key_positions encoded NON-packed (field 2, wire type 0 — one
// varint field per value). The spec-legal alternative form.
function encodeComboConfigUnpacked(c: ComboFixture): Uint8Array {
  const w = _m0.Writer.create();
  if (c.comboId !== 0) w.uint32(8).uint32(c.comboId);
  for (const p of c.keyPositions) w.uint32(16).uint32(p);
  if (c.timeoutMs !== 0) w.uint32(24).uint32(c.timeoutMs);
  return w.finish();
}

// Wrap ComboConfig bytes into a full Response { getAllCombos: { combos } }.
function encodeGetAllCombosResponse(comboBufs: Uint8Array[]): Uint8Array {
  const inner = _m0.Writer.create();
  for (const b of comboBufs) inner.uint32(10).bytes(b); // repeated ComboConfig, field 1
  const w = _m0.Writer.create();
  w.uint32(34).bytes(inner.finish()); // GetAllCombosResponse, field 4
  return w.finish();
}

describe("combos decodeResponse — key_positions packing", () => {
  it("decodes PACKED key_positions (firmware/nanopb form) across multiple combos", () => {
    // Regression target: before the fix the packed length byte was misread as a
    // key position and the parse cascaded into "invalid wire type".
    const data = encodeGetAllCombosResponse([
      encodeComboConfigPacked({ comboId: 1, keyPositions: [5, 13], timeoutMs: 50 }),
      encodeComboConfigPacked({ comboId: 2, keyPositions: [7, 21, 29], timeoutMs: 40 }),
    ]);

    const combos = decodeResponse(data).getAllCombos!.combos;

    expect(combos).toHaveLength(2);
    expect(combos[0].comboId).toBe(1);
    expect(combos[0].keyPositions).toEqual([5, 13]);
    expect(combos[0].timeoutMs).toBe(50);
    expect(combos[1].comboId).toBe(2);
    expect(combos[1].keyPositions).toEqual([7, 21, 29]);
    expect(combos[1].timeoutMs).toBe(40);
  });

  it("still decodes NON-packed key_positions (spec fallback)", () => {
    const data = encodeGetAllCombosResponse([
      encodeComboConfigUnpacked({ comboId: 3, keyPositions: [2, 4], timeoutMs: 50 }),
    ]);

    const combos = decodeResponse(data).getAllCombos!.combos;

    expect(combos).toHaveLength(1);
    expect(combos[0].comboId).toBe(3);
    expect(combos[0].keyPositions).toEqual([2, 4]);
  });

  it("decodes a single packed combo (the case that appeared to work before)", () => {
    const data = encodeGetAllCombosResponse([
      encodeComboConfigPacked({ comboId: 1, keyPositions: [10, 22], timeoutMs: 50 }),
    ]);

    const combos = decodeResponse(data).getAllCombos!.combos;

    expect(combos).toHaveLength(1);
    expect(combos[0].keyPositions).toEqual([10, 22]);
  });
});
