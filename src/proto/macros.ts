/**
 * Protobuf codec for the mk__macros (runtime macros) module.
 * Subsystem identifier: "mk__macros"
 *
 * Proto definition: zmk-module-runtime-macros proto/mk/macros/custom.proto
 * (sizes in custom.options, limits in include/zmk/macros/runtime_macros.h).
 *
 * Request oneof:
 *   1 get_info, 2 get_macro, 3 begin_set, 4 append_steps, 5 commit, 6 delete
 * Response oneof:
 *   1 error, 2 info, 3 macro, 4 ok
 *
 * Every repeated field here is a message, so nothing is packed. Unknown fields
 * are skipped so a newer firmware can add fields without breaking the app.
 */
import * as _m0 from "protobufjs/minimal";

export const SUBSYSTEM_ID = "mk__macros";

/** The display name of the key behavior that plays a macro (&rmacro). */
export const MACRO_BEHAVIOR_NAME = "Macro";

// Step types. They travel over RPC and into flash: never renumber.
export const STEP_TAP = 1;
export const STEP_PRESS = 2;
export const STEP_RELEASE = 3;
export const STEP_WAIT = 4;

// One request payload may carry at most 128 bytes
// (CONFIG_ZMK_STUDIO_RPC_CUSTOM_SUBSYSTEM_REQUEST_PAYLOAD_MAX_BYTES on minimal-keys).
export const REQUEST_PAYLOAD_MAX_BYTES = 128;
// custom.options: AppendStepsRequest.steps max_count:8, GetMacroResponse.steps max_count:16.
export const APPEND_CHUNK_STEPS = 8;
export const READ_CHUNK_STEPS = 16;

// Defaults from runtime_macros.h. The real limits come from get_info.
export const DEFAULT_MAX_MACROS = 16;
export const DEFAULT_MAX_STEPS_PER_MACRO = 128;
export const DEFAULT_TOTAL_STEPS = 512;
export const DEFAULT_NAME_MAX_BYTES = 32;

export const MIN_TAP_MS = 10;
export const MAX_TAP_MS = 500;
export const MIN_WAIT_MS = 10;
export const MAX_WAIT_MS = 1000;
export const MIN_WAIT_STEP_MS = 1;
export const MAX_WAIT_STEP_MS = 10000;
export const DEFAULT_TAP_MS = 30;
export const DEFAULT_WAIT_MS = 40;

// ErrorResponse codes (custom.proto).
export const ERR_BAD_REQUEST = 1;
export const ERR_TOO_LONG = 2;
export const ERR_NO_SPACE = 3;
export const ERR_INVALID_STEP = 4;
export const ERR_OUT_OF_ORDER = 5;
export const ERR_SAVE_FAILED = 6;
export const ERR_EMPTY_SLOT = 7;

export interface Step {
  type: number;
  value: number;
}

export interface MacroSummary {
  index: number;
  stepCount: number;
}

export interface MacroInfo {
  version: number;
  maxMacros: number;
  maxStepsPerMacro: number;
  totalSteps: number;
  usedSteps: number;
  nameMaxBytes: number;
  macros: MacroSummary[];
}

export interface MacroPart {
  index: number;
  name: string;
  tapMs: number;
  waitMs: number;
  stepCount: number;
  offset: number;
  steps: Step[];
}

export interface BeginSet {
  index: number;
  name: string;
  tapMs: number;
  waitMs: number;
  stepCount: number;
}

export interface MacrosResponse {
  error?: { code: number; message: string };
  info?: MacroInfo;
  macro?: MacroPart;
  ok?: { usedSteps: number };
}

// --- Encoding ---

function writeUint(w: _m0.Writer, field: number, value: number) {
  const v = value >>> 0;
  if (v !== 0) w.uint32(field << 3).uint32(v);
}

function encodeStep(step: Step): Uint8Array {
  const w = _m0.Writer.create();
  writeUint(w, 1, step.type);
  writeUint(w, 2, step.value);
  return w.finish();
}

/** Wraps an inner request message in the Request oneof. */
function wrap(field: number, inner: Uint8Array): Uint8Array {
  // Always written, even when empty: an empty commit(0) still selects the oneof.
  return _m0.Writer.create().uint32((field << 3) | 2).bytes(inner).finish();
}

export function encodeGetInfo(): Uint8Array {
  return wrap(1, new Uint8Array(0));
}

export function encodeGetMacro(index: number, offset: number): Uint8Array {
  const w = _m0.Writer.create();
  writeUint(w, 1, index);
  writeUint(w, 2, offset);
  return wrap(2, w.finish());
}

export function encodeBeginSet(req: BeginSet): Uint8Array {
  const w = _m0.Writer.create();
  writeUint(w, 1, req.index);
  if (req.name !== "") w.uint32(18).string(req.name);
  writeUint(w, 3, req.tapMs);
  writeUint(w, 4, req.waitMs);
  writeUint(w, 5, req.stepCount);
  return wrap(3, w.finish());
}

export function encodeAppendSteps(index: number, offset: number, steps: Step[]): Uint8Array {
  const w = _m0.Writer.create();
  writeUint(w, 1, index);
  writeUint(w, 2, offset);
  for (const s of steps) w.uint32(26).bytes(encodeStep(s));
  return wrap(4, w.finish());
}

export function encodeCommit(index: number): Uint8Array {
  const w = _m0.Writer.create();
  writeUint(w, 1, index);
  return wrap(5, w.finish());
}

export function encodeDelete(index: number): Uint8Array {
  const w = _m0.Writer.create();
  writeUint(w, 1, index);
  return wrap(6, w.finish());
}

/** Splits steps into append_steps chunks of at most `size` steps, in order. */
export function chunkSteps(steps: Step[], size = APPEND_CHUNK_STEPS): { offset: number; steps: Step[] }[] {
  const out: { offset: number; steps: Step[] }[] = [];
  for (let offset = 0; offset < steps.length; offset += size) {
    out.push({ offset, steps: steps.slice(offset, offset + size) });
  }
  return out;
}

/** The full write sequence: begin_set, append_steps in order, commit. */
export function encodeWriteSequence(def: {
  index: number;
  name: string;
  tapMs: number;
  waitMs: number;
  steps: Step[];
}): Uint8Array[] {
  return [
    encodeBeginSet({
      index: def.index,
      name: def.name,
      tapMs: def.tapMs,
      waitMs: def.waitMs,
      stepCount: def.steps.length,
    }),
    ...chunkSteps(def.steps).map((c) => encodeAppendSteps(def.index, c.offset, c.steps)),
    encodeCommit(def.index),
  ];
}

// --- Decoding ---

function decodeStep(reader: _m0.Reader, length: number): Step {
  const end = reader.pos + length;
  const s: Step = { type: 0, value: 0 };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: s.type = reader.uint32(); break;
      case 2: s.value = reader.uint32() >>> 0; break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return s;
}

function decodeSummary(reader: _m0.Reader, length: number): MacroSummary {
  const end = reader.pos + length;
  const s: MacroSummary = { index: 0, stepCount: 0 };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: s.index = reader.uint32(); break;
      case 2: s.stepCount = reader.uint32(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return s;
}

function decodeInfo(reader: _m0.Reader, length: number): MacroInfo {
  const end = reader.pos + length;
  const info: MacroInfo = {
    version: 0,
    maxMacros: 0,
    maxStepsPerMacro: 0,
    totalSteps: 0,
    usedSteps: 0,
    nameMaxBytes: 0,
    macros: [],
  };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: info.version = reader.uint32(); break;
      case 2: info.maxMacros = reader.uint32(); break;
      case 3: info.maxStepsPerMacro = reader.uint32(); break;
      case 4: info.totalSteps = reader.uint32(); break;
      case 5: info.usedSteps = reader.uint32(); break;
      case 6: info.nameMaxBytes = reader.uint32(); break;
      case 7:
        if ((tag & 7) === 2) info.macros.push(decodeSummary(reader, reader.uint32()));
        else reader.skipType(tag & 7);
        break;
      default: reader.skipType(tag & 7); break;
    }
  }
  // A zero limit means the field was absent: fall back to the firmware defaults.
  if (!info.maxMacros) info.maxMacros = DEFAULT_MAX_MACROS;
  if (!info.maxStepsPerMacro) info.maxStepsPerMacro = DEFAULT_MAX_STEPS_PER_MACRO;
  if (!info.totalSteps) info.totalSteps = DEFAULT_TOTAL_STEPS;
  if (!info.nameMaxBytes) info.nameMaxBytes = DEFAULT_NAME_MAX_BYTES;
  return info;
}

function decodeMacro(reader: _m0.Reader, length: number): MacroPart {
  const end = reader.pos + length;
  const m: MacroPart = { index: 0, name: "", tapMs: 0, waitMs: 0, stepCount: 0, offset: 0, steps: [] };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: m.index = reader.uint32(); break;
      case 2: m.name = reader.string(); break;
      case 3: m.tapMs = reader.uint32(); break;
      case 4: m.waitMs = reader.uint32(); break;
      case 5: m.stepCount = reader.uint32(); break;
      case 6: m.offset = reader.uint32(); break;
      case 7:
        if ((tag & 7) === 2) m.steps.push(decodeStep(reader, reader.uint32()));
        else reader.skipType(tag & 7);
        break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return m;
}

export function decodeResponse(data: Uint8Array): MacrosResponse {
  const reader = _m0.Reader.create(data);
  const result: MacrosResponse = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if ((tag & 7) !== 2) {
      reader.skipType(tag & 7);
      continue;
    }
    const len = reader.uint32();
    switch (tag >>> 3) {
      case 1: {
        const end = reader.pos + len;
        const error = { code: 0, message: "" };
        while (reader.pos < end) {
          const t = reader.uint32();
          if (t >>> 3 === 1) error.code = reader.uint32();
          else if (t >>> 3 === 2) error.message = reader.string();
          else reader.skipType(t & 7);
        }
        result.error = error;
        break;
      }
      case 2:
        result.info = decodeInfo(reader, len);
        break;
      case 3:
        result.macro = decodeMacro(reader, len);
        break;
      case 4: {
        const end = reader.pos + len;
        const ok = { usedSteps: 0 };
        while (reader.pos < end) {
          const t = reader.uint32();
          if (t >>> 3 === 1) ok.usedSteps = reader.uint32();
          else reader.skipType(t & 7);
        }
        result.ok = ok;
        break;
      }
      default:
        reader.skip(len);
        break;
    }
  }
  return result;
}

/** A plain Japanese sentence for each firmware error code. */
export function errorMessage(code: number): string {
  switch (code) {
    case ERR_BAD_REQUEST:
      return "キーボードが要求を受け取れませんでした。アプリとファームウェアを最新にしてください。";
    case ERR_TOO_LONG:
      return "マクロが長すぎます。手順か名前を短くしてください。";
    case ERR_NO_SPACE:
      return "キーボードの空きが足りません。ほかのマクロを短くするか、削除してください。";
    case ERR_INVALID_STEP:
      return "キーボードが使えない手順があります。その手順を消してから保存してください。";
    case ERR_OUT_OF_ORDER:
      return "書き込みが途中で途切れました。もう一度保存してください。";
    case ERR_SAVE_FAILED:
      return "キーボードに保存できませんでした。もう一度保存してください。";
    case ERR_EMPTY_SLOT:
      return "このマクロはキーボードにありません。一覧を読み直してください。";
    default:
      return `キーボードがエラーを返しました（番号 ${code}）。もう一度試してください。`;
  }
}
