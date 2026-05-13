/**
 * Protobuf codec for cormoran_combos (Runtime Combos) module.
 * Subsystem identifier: "cormoran_combos"
 *
 * Proto definition: cormoran/combos/custom.proto
 *
 * Request oneof:
 *   field 1: SetComboRequest
 *   field 2: DeleteComboRequest
 *   field 3: GetAllCombosRequest
 *
 * Response oneof:
 *   field 1: ErrorResponse
 *   field 2: SetComboResponse
 *   field 3: DeleteComboResponse
 *   field 4: GetAllCombosResponse
 */
import * as _m0 from "protobufjs/minimal";

export const SUBSYSTEM_ID = "cormoran_combos";

export interface Binding {
  behaviorId: number;
  param1: number;
  param2: number;
}

export interface ComboConfig {
  comboId: number;
  keyPositions: number[];
  timeoutMs: number;
  binding: Binding | null;
  layerMask: number;
  slowRelease: boolean;
}

// --- Binding encode/decode ---

function encodeBinding(binding: Binding): Uint8Array {
  const w = _m0.Writer.create();
  if (binding.behaviorId !== 0) w.uint32(8).uint32(binding.behaviorId);
  if (binding.param1 !== 0) w.uint32(16).uint32(binding.param1);
  if (binding.param2 !== 0) w.uint32(24).uint32(binding.param2);
  return w.finish();
}

function decodeBinding(reader: _m0.Reader, length: number): Binding {
  const end = reader.pos + length;
  const b: Binding = { behaviorId: 0, param1: 0, param2: 0 };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: b.behaviorId = reader.uint32(); break;
      case 2: b.param1 = reader.uint32(); break;
      case 3: b.param2 = reader.uint32(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return b;
}

// --- ComboConfig encode/decode ---

function encodeComboConfig(combo: ComboConfig): Uint8Array {
  const w = _m0.Writer.create();
  if (combo.comboId !== 0) w.uint32(8).uint32(combo.comboId);
  for (const pos of combo.keyPositions) {
    w.uint32(16).uint32(pos);
  }
  if (combo.timeoutMs !== 0) w.uint32(24).uint32(combo.timeoutMs);
  if (combo.binding) w.uint32(34).bytes(encodeBinding(combo.binding));
  if (combo.layerMask !== 0) w.uint32(40).uint32(combo.layerMask);
  if (combo.slowRelease) w.uint32(48).bool(true);
  return w.finish();
}

function decodeComboConfig(reader: _m0.Reader, length: number): ComboConfig {
  const end = reader.pos + length;
  const c: ComboConfig = {
    comboId: 0, keyPositions: [], timeoutMs: 50,
    binding: null, layerMask: 0, slowRelease: false,
  };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: c.comboId = reader.uint32(); break;
      case 2: c.keyPositions.push(reader.uint32()); break;
      case 3: c.timeoutMs = reader.uint32(); break;
      case 4: c.binding = decodeBinding(reader, reader.uint32()); break;
      case 5: c.layerMask = reader.uint32(); break;
      case 6: c.slowRelease = reader.bool(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return c;
}

// --- Request encoding ---

export function encodeSetCombo(combo: ComboConfig): Uint8Array {
  const inner = _m0.Writer.create();
  inner.uint32(10).bytes(encodeComboConfig(combo));
  const w = _m0.Writer.create();
  w.uint32(10).bytes(inner.finish()); // field 1
  return w.finish();
}

export function encodeDeleteCombo(comboId: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (comboId !== 0) inner.uint32(8).uint32(comboId);
  const w = _m0.Writer.create();
  w.uint32(18).bytes(inner.finish()); // field 2
  return w.finish();
}

export function encodeGetAllCombos(): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(26).fork().ldelim(); // field 3: empty message
  return w.finish();
}

// --- Response decoding ---

export interface CombosResponse {
  error?: string;
  setCombo?: { success: boolean };
  deleteCombo?: { success: boolean };
  getAllCombos?: { combos: ComboConfig[] };
}

export function decodeResponse(data: Uint8Array): CombosResponse {
  const reader = _m0.Reader.create(data);
  const result: CombosResponse = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: { // ErrorResponse
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) result.error = reader.string();
          else reader.skipType(innerTag & 7);
        }
        break;
      }
      case 2: { // SetComboResponse
        const len = reader.uint32();
        const end = reader.pos + len;
        let success = false;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) success = reader.bool();
          else reader.skipType(innerTag & 7);
        }
        result.setCombo = { success };
        break;
      }
      case 3: { // DeleteComboResponse
        const len = reader.uint32();
        const end = reader.pos + len;
        let success = false;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) success = reader.bool();
          else reader.skipType(innerTag & 7);
        }
        result.deleteCombo = { success };
        break;
      }
      case 4: { // GetAllCombosResponse
        const len = reader.uint32();
        const end = reader.pos + len;
        const combos: ComboConfig[] = [];
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) {
            combos.push(decodeComboConfig(reader, reader.uint32()));
          } else {
            reader.skipType(innerTag & 7);
          }
        }
        result.getAllCombos = { combos };
        break;
      }
      default:
        reader.skipType(tag & 7);
        break;
    }
  }
  return result;
}
