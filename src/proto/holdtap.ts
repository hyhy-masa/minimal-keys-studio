/**
 * Protobuf codec for zmk__hold_tap (Runtime Hold-Tap Configuration) module.
 * Subsystem identifier: "zmk__hold_tap"
 */
import * as _m0 from "protobufjs/minimal";

export const SUBSYSTEM_ID = "zmk__hold_tap";

export const HoldTapFlavor = {
  HOLD_PREFERRED: 0,
  BALANCED: 1,
  TAP_PREFERRED: 2,
  TAP_UNLESS_INTERRUPTED: 3,
} as const;
export type HoldTapFlavor =
  (typeof HoldTapFlavor)[keyof typeof HoldTapFlavor];

export const FLAVOR_LABELS: Record<number, string> = {
  0: "ホールド優先",
  1: "バランス",
  2: "タップ優先",
  3: "他キーでホールド",
};

export interface HoldTapInfo {
  id: number;
  name: string;
  tappingTermMs: number;
  quickTapMs: number;
  requirePriorIdleMs: number;
  flavor: HoldTapFlavor;
  defaultTappingTermMs: number;
  defaultQuickTapMs: number;
  defaultRequirePriorIdleMs: number;
  defaultFlavor: HoldTapFlavor;
}

// --- Request encoding ---

export function encodeListHoldTaps(): Uint8Array {
  const w = _m0.Writer.create();
  // field 1: listHoldTaps (empty message)
  w.uint32(10).fork().ldelim();
  return w.finish();
}

export function encodeSetTappingTerm(
  id: number,
  value: number
): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (value !== 0) inner.uint32(16).uint32(value);
  const w = _m0.Writer.create();
  w.uint32(18).bytes(inner.finish()); // field 2
  return w.finish();
}

export function encodeSetQuickTap(
  id: number,
  value: number
): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (value !== 0) inner.uint32(16).uint32(value);
  const w = _m0.Writer.create();
  w.uint32(26).bytes(inner.finish()); // field 3
  return w.finish();
}

export function encodeSetRequirePriorIdle(
  id: number,
  value: number
): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (value !== 0) inner.uint32(16).uint32(value);
  const w = _m0.Writer.create();
  w.uint32(34).bytes(inner.finish()); // field 4
  return w.finish();
}

export function encodeSetFlavor(
  id: number,
  value: number
): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (value !== 0) inner.uint32(16).uint32(value);
  const w = _m0.Writer.create();
  w.uint32(42).bytes(inner.finish()); // field 5
  return w.finish();
}

export function encodeResetHoldTap(id: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  const w = _m0.Writer.create();
  w.uint32(50).bytes(inner.finish()); // field 6
  return w.finish();
}

// --- Response decoding ---

function decodeHoldTapInfo(
  reader: _m0.Reader,
  length: number
): HoldTapInfo {
  const end = reader.pos + length;
  const info: HoldTapInfo = {
    id: 0,
    name: "",
    tappingTermMs: 0,
    quickTapMs: 0,
    requirePriorIdleMs: 0,
    flavor: 0,
    defaultTappingTermMs: 0,
    defaultQuickTapMs: 0,
    defaultRequirePriorIdleMs: 0,
    defaultFlavor: 0,
  };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1:
        info.id = reader.uint32();
        break;
      case 2:
        info.name = reader.string();
        break;
      case 3:
        info.tappingTermMs = reader.uint32();
        break;
      case 4:
        info.quickTapMs = reader.uint32();
        break;
      case 5:
        info.requirePriorIdleMs = reader.uint32();
        break;
      case 6:
        info.flavor = reader.uint32() as HoldTapFlavor;
        break;
      case 7:
        info.defaultTappingTermMs = reader.uint32();
        break;
      case 8:
        info.defaultQuickTapMs = reader.uint32();
        break;
      case 9:
        info.defaultRequirePriorIdleMs = reader.uint32();
        break;
      case 10:
        info.defaultFlavor = reader.uint32() as HoldTapFlavor;
        break;
      default:
        reader.skipType(tag & 7);
        break;
    }
  }
  return info;
}

export interface HoldTapResponse {
  error?: string;
  listHoldTaps?: { holdTaps: HoldTapInfo[] };
  setTappingTerm?: { success: boolean };
  setQuickTap?: { success: boolean };
  setRequirePriorIdle?: { success: boolean };
  setFlavor?: { success: boolean };
  resetHoldTap?: { success: boolean };
}

export function decodeResponse(data: Uint8Array): HoldTapResponse {
  const reader = _m0.Reader.create(data);
  const result: HoldTapResponse = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: {
        // error
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) result.error = reader.string();
          else reader.skipType(innerTag & 7);
        }
        break;
      }
      case 2: {
        // listHoldTaps
        const len = reader.uint32();
        const end = reader.pos + len;
        const holdTaps: HoldTapInfo[] = [];
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) {
            holdTaps.push(decodeHoldTapInfo(reader, reader.uint32()));
          } else {
            reader.skipType(innerTag & 7);
          }
        }
        result.listHoldTaps = { holdTaps };
        break;
      }
      case 3: {
        // setTappingTerm
        const len = reader.uint32();
        const end = reader.pos + len;
        let success = false;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) success = reader.bool();
          else reader.skipType(innerTag & 7);
        }
        result.setTappingTerm = { success };
        break;
      }
      case 4: {
        // setQuickTap
        const len = reader.uint32();
        const end = reader.pos + len;
        let success = false;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) success = reader.bool();
          else reader.skipType(innerTag & 7);
        }
        result.setQuickTap = { success };
        break;
      }
      case 5: {
        // setRequirePriorIdle
        const len = reader.uint32();
        const end = reader.pos + len;
        let success = false;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) success = reader.bool();
          else reader.skipType(innerTag & 7);
        }
        result.setRequirePriorIdle = { success };
        break;
      }
      case 6: {
        // setFlavor
        const len = reader.uint32();
        const end = reader.pos + len;
        let success = false;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) success = reader.bool();
          else reader.skipType(innerTag & 7);
        }
        result.setFlavor = { success };
        break;
      }
      case 7: {
        // resetHoldTap
        const len = reader.uint32();
        const end = reader.pos + len;
        let success = false;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) success = reader.bool();
          else reader.skipType(innerTag & 7);
        }
        result.resetHoldTap = { success };
        break;
      }
      default:
        reader.skipType(tag & 7);
        break;
    }
  }
  return result;
}

// --- Notification decoding ---

export interface HoldTapNotification {
  holdTapChanged?: HoldTapInfo;
}

export function decodeNotification(
  data: Uint8Array
): HoldTapNotification {
  const reader = _m0.Reader.create(data);
  const result: HoldTapNotification = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: {
        // holdTapChanged
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) {
            result.holdTapChanged = decodeHoldTapInfo(
              reader,
              reader.uint32()
            );
          } else {
            reader.skipType(innerTag & 7);
          }
        }
        break;
      }
      default:
        reader.skipType(tag & 7);
        break;
    }
  }
  return result;
}
