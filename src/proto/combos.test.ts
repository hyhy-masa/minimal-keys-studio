import { describe, it, expect } from "vitest";
import * as _m0 from "protobufjs/minimal";
import {
  decodeResponse,
  encodeSetCombo,
  normalizeForSave,
  nextFreeComboId,
  layerMaskFromIndices,
  layerIndicesFromMask,
  comboScreen,
  isWriteSuccess,
  MAX_COMBOS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_PRIOR_IDLE_MS,
  type ComboConfig,
} from "./combos";

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

// --- Added with the combo engine (plan v9 P3, tests 2-11) ---

function combo(overrides: Partial<ComboConfig> = {}): ComboConfig {
  return {
    comboId: 1, keyPositions: [17, 18], timeoutMs: 200,
    binding: { behaviorId: 3, param1: 41, param2: 0 },
    layerMask: 0, slowRelease: false, requirePriorIdleMs: 100,
    ...overrides,
  };
}

// Independent reader for what encodeSetCombo puts on the wire: returns the
// raw (field number -> values) of the inner ComboConfig.
function sentFields(bytes: Uint8Array): Map<number, number[]> {
  const outer = _m0.Reader.create(bytes);
  expect(outer.uint32()).toBe(10); // Request.set_combo
  const setReq = _m0.Reader.create(outer.bytes());
  expect(setReq.uint32()).toBe(10); // SetComboRequest.combo
  const r = _m0.Reader.create(setReq.bytes());
  const out = new Map<number, number[]>();
  while (r.pos < r.len) {
    const tag = r.uint32();
    const f = tag >>> 3;
    let v: number;
    if ((tag & 7) === 2) { r.bytes(); v = -1; } else v = r.uint32();
    out.set(f, [...(out.get(f) ?? []), v]);
  }
  return out;
}

function getAllResponse(opts: { combos?: Uint8Array[]; engineVersion?: number; engineEnabled?: boolean }): Uint8Array {
  const inner = _m0.Writer.create();
  for (const b of opts.combos ?? []) inner.uint32(10).bytes(b);
  if (opts.engineVersion) inner.uint32(16).uint32(opts.engineVersion);
  if (opts.engineEnabled) inner.uint32(24).bool(true);
  const w = _m0.Writer.create();
  w.uint32(34).bytes(inner.finish());
  return w.finish();
}

describe("combos — limits and defaults", () => {
  it("1: the combo limit matches the firmware (16)", () => {
    expect(MAX_COMBOS).toBe(16);
  });

  it("2: timeout is clamped to 10..500 on save; new combos default to 200", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(200);
    expect(normalizeForSave(combo({ timeoutMs: 5 })).timeoutMs).toBe(10);
    expect(normalizeForSave(combo({ timeoutMs: 900 })).timeoutMs).toBe(500);
    expect(normalizeForSave(combo({ timeoutMs: 260 })).timeoutMs).toBe(260);
    expect(normalizeForSave(combo({ timeoutMs: 0 })).timeoutMs).toBe(200);
    expect(sentFields(encodeSetCombo(normalizeForSave(combo({ timeoutMs: 900 })))).get(3)).toEqual([500]);
  });

  it("3: require_prior_idle_ms is clamped, defaults to 100 and is always sent (never 0)", () => {
    expect(DEFAULT_PRIOR_IDLE_MS).toBe(100);
    expect(normalizeForSave(combo({ requirePriorIdleMs: 3 })).requirePriorIdleMs).toBe(10);
    expect(normalizeForSave(combo({ requirePriorIdleMs: 9000 })).requirePriorIdleMs).toBe(500);
    const fromZero = normalizeForSave(combo({ requirePriorIdleMs: 0 }));
    expect(fromZero.requirePriorIdleMs).toBe(100);
    expect(sentFields(encodeSetCombo(fromZero)).get(7)).toEqual([100]);
  });
});

describe("combos — decoding the engine fields", () => {
  it("4: reads field 7 (require_prior_idle_ms) of a stored combo", () => {
    const w = _m0.Writer.create();
    w.uint32(8).uint32(4);
    w.uint32(56).uint32(150);
    const all = decodeResponse(getAllResponse({ combos: [w.finish()], engineVersion: 1, engineEnabled: true })).getAllCombos!;
    expect(all.combos[0].requirePriorIdleMs).toBe(150);
  });

  it("4b: a combo without field 7 reads as 0 (firmware default)", () => {
    const all = decodeResponse(getAllResponse({
      combos: [encodeComboConfigPacked({ comboId: 1, keyPositions: [1, 2], timeoutMs: 50 })],
    })).getAllCombos!;
    expect(all.combos[0].requirePriorIdleMs).toBe(0);
  });

  it("8: v1.0.7-shaped response (no engine fields) reads as version 0, disabled", () => {
    const all = decodeResponse(getAllResponse({})).getAllCombos!;
    expect(all.engineVersion).toBe(0);
    expect(all.engineEnabled).toBe(false);
  });

  it("8b/10: engine_version and engine_enabled are read", () => {
    expect(decodeResponse(getAllResponse({ engineVersion: 1 })).getAllCombos).toMatchObject({ engineVersion: 1, engineEnabled: false });
    expect(decodeResponse(getAllResponse({ engineVersion: 1, engineEnabled: true })).getAllCombos).toMatchObject({ engineVersion: 1, engineEnabled: true });
  });
});

describe("combos — layer mask, ids, write results, screen", () => {
  it("5: layer bits are set by layer index", () => {
    expect(layerMaskFromIndices([0, 2])).toBe(0b101);
    expect(layerMaskFromIndices([31])).toBe(0x80000000);
    expect(layerMaskFromIndices([32, -1])).toBe(0);
    expect(layerIndicesFromMask(0b101)).toEqual([0, 2]);
  });

  it("6: a new combo's id is the smallest unused id", () => {
    expect(nextFreeComboId([])).toBe(1);
    expect(nextFreeComboId([combo({ comboId: 1 }), combo({ comboId: 2 })])).toBe(3);
    expect(nextFreeComboId([combo({ comboId: 1 }), combo({ comboId: 3 })])).toBe(2);
  });

  it("7: success=false (or an error, or no result) is a failed write", () => {
    expect(isWriteSuccess({ setCombo: { success: true } }, "set")).toBe(true);
    expect(isWriteSuccess({ setCombo: { success: false } }, "set")).toBe(false);
    expect(isWriteSuccess({ error: "x", setCombo: { success: true } }, "set")).toBe(false);
    expect(isWriteSuccess({}, "set")).toBe(false);
    expect(isWriteSuccess({ deleteCombo: { success: false } }, "delete")).toBe(false);
    expect(isWriteSuccess({ deleteCombo: { success: true } }, "delete")).toBe(true);
  });

  it("8/8b/8c/10: screen follows the response", () => {
    expect(comboScreen(false, { status: "loading" })).toBe("unavailable");
    expect(comboScreen(true, { status: "error" })).toBe("read-error");
    expect(comboScreen(true, { status: "loaded", engineVersion: 0, engineEnabled: false })).toBe("needs-update");
    expect(comboScreen(true, { status: "loaded", engineVersion: 1, engineEnabled: false })).toBe("engine-disabled");
    expect(comboScreen(true, { status: "loaded", engineVersion: 1, engineEnabled: true })).toBe("ready");
  });
});
