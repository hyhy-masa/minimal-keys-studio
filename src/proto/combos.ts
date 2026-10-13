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
 *
 * ComboConfig field 7 (require_prior_idle_ms) and GetAllCombosResponse fields
 * 2-3 (engine_version, engine_enabled) were added with the combo engine.
 */
import * as _m0 from "protobufjs/minimal";

export const SUBSYSTEM_ID = "cormoran_combos";

// Must match the firmware's GetAllCombosResponse.combos max_count
// (zmk-module-runtime-combos custom.options).
export const MAX_COMBOS = 16;
export const MAX_KEYS_PER_COMBO = 4;

// The firmware clamps both timing fields to this range (custom_handler.c).
export const MIN_MS = 10;
export const MAX_MS = 500;

export const DEFAULT_TIMEOUT_MS = 200;
// Keep in step with the firmware's CONFIG_ZMK_RUNTIME_COMBOS_DEFAULT_PRIOR_IDLE_MS
// (Kconfig): a stored 0 means "use the firmware default", which is this value.
// If the Kconfig default changes, change this too.
export const DEFAULT_PRIOR_IDLE_MS = 100;

export function clampMs(ms: number): number {
  if (!Number.isFinite(ms)) return MIN_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, Math.round(ms)));
}

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
  // 0 means the field was absent: the firmware then uses its Kconfig default.
  requirePriorIdleMs: number;
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
  if (combo.requirePriorIdleMs !== 0) w.uint32(56).uint32(combo.requirePriorIdleMs);
  return w.finish();
}

function decodeComboConfig(reader: _m0.Reader, length: number): ComboConfig {
  const end = reader.pos + length;
  const c: ComboConfig = {
    comboId: 0, keyPositions: [], timeoutMs: 50,
    binding: null, layerMask: 0, slowRelease: false, requirePriorIdleMs: 0,
  };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: c.comboId = reader.uint32(); break;
      case 2: {
        // key_positions is a `repeated uint32`, which nanopb (the firmware's
        // encoder) always sends PACKED (wire type 2: a length-delimited block
        // of varints). The previous single read assumed the non-packed form and
        // misread the length byte as a key position, cascading into a corrupt
        // protobuf parse ("invalid wire type"). Handle both forms.
        if ((tag & 7) === 2) {
          const end2 = reader.uint32() + reader.pos;
          while (reader.pos < end2) c.keyPositions.push(reader.uint32());
        } else {
          c.keyPositions.push(reader.uint32());
        }
        break;
      }
      case 3: c.timeoutMs = reader.uint32(); break;
      case 4: c.binding = decodeBinding(reader, reader.uint32()); break;
      case 5: c.layerMask = reader.uint32(); break;
      case 6: c.slowRelease = reader.bool(); break;
      case 7: c.requirePriorIdleMs = reader.uint32(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return c;
}

// --- Request encoding ---

/**
 * What the app sends when saving: both timing fields are always sent and
 * clamped to MIN_MS..MAX_MS. A stored 0 for require_prior_idle_ms (a combo the
 * app read without field 7) is sent as the default instead of 0.
 */
export function normalizeForSave(combo: ComboConfig): ComboConfig {
  return {
    ...combo,
    timeoutMs: clampMs(combo.timeoutMs || DEFAULT_TIMEOUT_MS),
    requirePriorIdleMs: clampMs(combo.requirePriorIdleMs || DEFAULT_PRIOR_IDLE_MS),
  };
}

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
  getAllCombos?: {
    combos: ComboConfig[];
    // Firmware before the engine (v1.0.7 and older) sends neither field, so
    // they read as 0 / false.
    engineVersion: number;
    engineEnabled: boolean;
  };
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
        let engineVersion = 0;
        let engineEnabled = false;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          switch (innerTag >>> 3) {
            case 1: combos.push(decodeComboConfig(reader, reader.uint32())); break;
            case 2: engineVersion = reader.uint32(); break;
            case 3: engineEnabled = reader.bool(); break;
            default: reader.skipType(innerTag & 7); break;
          }
        }
        result.getAllCombos = { combos, engineVersion, engineEnabled };
        break;
      }
      default:
        reader.skipType(tag & 7);
        break;
    }
  }
  return result;
}

// --- Helpers used by the combo screen ---

/**
 * The id a new combo gets when it is saved: the smallest positive id no
 * stored combo uses. The firmware matches ids to slots and puts an unknown id
 * into a free slot, so any unused id is valid. Picking it at save time (not
 * when editing starts) means a cancelled edit consumes nothing.
 */
export function nextFreeComboId(combos: ComboConfig[]): number {
  const used = new Set(combos.map((c) => c.comboId));
  let id = 1;
  while (used.has(id)) id++;
  return id;
}

/** Bit n of layer_mask enables the layer at index n; 0 means every layer. */
export function layerMaskFromIndices(indices: number[]): number {
  let mask = 0;
  for (const i of indices) {
    if (Number.isInteger(i) && i >= 0 && i < 32) mask |= 1 << i;
  }
  return mask >>> 0;
}

export function layerIndicesFromMask(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 32; i++) {
    if ((mask >>> i) & 1) out.push(i);
  }
  return out;
}

/**
 * Which screen the combo tab shows.
 * - unavailable:     the firmware has no combo subsystem at all
 * - loading:         the list request is in flight
 * - read-error:      the list request failed or timed out
 * - needs-update:    the list was read but the firmware predates the engine
 * - engine-disabled: the firmware has the engine but it is turned off
 * - ready:           combos can be edited
 */
export type ComboScreen =
  | "unavailable"
  | "loading"
  | "read-error"
  | "needs-update"
  | "engine-disabled"
  | "ready";

export type ComboListLoad =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; engineVersion: number; engineEnabled: boolean };

export function comboScreen(hasSubsystem: boolean, load: ComboListLoad): ComboScreen {
  if (!hasSubsystem) return "unavailable";
  if (load.status === "loading") return "loading";
  if (load.status === "error") return "read-error";
  if (load.engineVersion < 1) return "needs-update";
  if (!load.engineEnabled) return "engine-disabled";
  return "ready";
}

/** A save or delete only succeeded when there is no error and success is true. */
export function isWriteSuccess(resp: CombosResponse, kind: "set" | "delete"): boolean {
  if (resp.error !== undefined) return false;
  const r = kind === "set" ? resp.setCombo : resp.deleteCombo;
  return r?.success === true;
}
