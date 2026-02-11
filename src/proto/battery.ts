/**
 * Protobuf codec for zmk__battery_history (Battery History) module.
 * Subsystem identifier: "zmk__battery_history"
 */
import * as _m0 from "protobufjs/minimal";

export const SUBSYSTEM_ID = "zmk__battery_history";

export interface BatteryHistoryEntry {
  timestamp: number;
  batteryLevel: number;
}

// --- Request encoding ---

export function encodeGetHistory(): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(10).fork().ldelim(); // field 1: empty message
  return w.finish();
}

export function encodeClearHistory(): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(18).fork().ldelim(); // field 2: empty message
  return w.finish();
}

// --- Response decoding ---

export interface BatteryResponse {
  error?: string;
  clearHistory?: { entriesCleared: number };
}

export function decodeResponse(data: Uint8Array): BatteryResponse {
  const reader = _m0.Reader.create(data);
  const result: BatteryResponse = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: { // error
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) result.error = reader.string();
          else reader.skipType(t & 7);
        }
        break;
      }
      case 3: { // clearHistory
        const len = reader.uint32();
        const end = reader.pos + len;
        let entriesCleared = 0;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) entriesCleared = reader.uint32();
          else reader.skipType(t & 7);
        }
        result.clearHistory = { entriesCleared };
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

export interface BatteryHistoryNotification {
  sourceId: number;
  entry: BatteryHistoryEntry;
  isLast: boolean;
  totalEntries: number;
  entryIndex: number;
}

export function decodeNotification(data: Uint8Array): BatteryHistoryNotification | null {
  const reader = _m0.Reader.create(data);
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if ((tag >>> 3) === 1) { // batteryHistory notification
      const len = reader.uint32();
      const end = reader.pos + len;
      const notif: BatteryHistoryNotification = {
        sourceId: 0,
        entry: { timestamp: 0, batteryLevel: 0 },
        isLast: false,
        totalEntries: 0,
        entryIndex: 0,
      };
      while (reader.pos < end) {
        const t = reader.uint32();
        switch (t >>> 3) {
          case 1: notif.sourceId = reader.uint32(); break;
          case 2: {
            const entryLen = reader.uint32();
            const entryEnd = reader.pos + entryLen;
            while (reader.pos < entryEnd) {
              const et = reader.uint32();
              switch (et >>> 3) {
                case 1: notif.entry.timestamp = reader.uint32(); break;
                case 2: notif.entry.batteryLevel = reader.uint32(); break;
                default: reader.skipType(et & 7); break;
              }
            }
            break;
          }
          case 3: notif.isLast = reader.bool(); break;
          case 4: notif.totalEntries = reader.uint32(); break;
          case 5: notif.entryIndex = reader.uint32(); break;
          default: reader.skipType(t & 7); break;
        }
      }
      return notif;
    } else {
      reader.skipType(tag & 7);
    }
  }
  return null;
}
