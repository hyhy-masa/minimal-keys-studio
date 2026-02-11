/**
 * Protobuf codec for zmk__settings (Settings RPC) module.
 * Subsystem identifier: "zmk__settings"
 */
import * as _m0 from "protobufjs/minimal";

export const SUBSYSTEM_ID = "zmk__settings";

export interface ActivitySettings {
  idleMs: number;
  sleepMs: number;
  source: number;
}

// --- Request encoding ---

export function encodeGetActivitySettings(): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(10).fork().ldelim(); // field 1: empty message
  return w.finish();
}

export function encodeSetActivitySettings(settings: ActivitySettings): Uint8Array {
  const inner = _m0.Writer.create();
  // ActivitySettings message
  const settingsMsg = _m0.Writer.create();
  if (settings.idleMs !== 0) settingsMsg.uint32(8).uint32(settings.idleMs);
  if (settings.sleepMs !== 0) settingsMsg.uint32(16).uint32(settings.sleepMs);
  if (settings.source !== 0) settingsMsg.uint32(24).uint32(settings.source);
  // field 1 of SetActivitySettingsRequest: settings
  inner.uint32(10).bytes(settingsMsg.finish());
  const w = _m0.Writer.create();
  w.uint32(18).bytes(inner.finish()); // field 2: setActivitySettings
  return w.finish();
}

export function encodeGetAllActivitySettings(): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(26).fork().ldelim(); // field 3: empty message
  return w.finish();
}

// --- Response decoding ---

function decodeActivitySettings(reader: _m0.Reader, length: number): ActivitySettings {
  const end = reader.pos + length;
  const s: ActivitySettings = { idleMs: 0, sleepMs: 0, source: 0 };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: s.idleMs = reader.uint32(); break;
      case 2: s.sleepMs = reader.uint32(); break;
      case 3: s.source = reader.uint32(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return s;
}

export interface SettingsResponse {
  error?: string;
  getActivitySettings?: ActivitySettings;
  setActivitySettings?: boolean;
  getAllActivitySettings?: boolean;
}

export function decodeResponse(data: Uint8Array): SettingsResponse {
  const reader = _m0.Reader.create(data);
  const result: SettingsResponse = {};
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
      case 2: { // getActivitySettings
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) {
            result.getActivitySettings = decodeActivitySettings(reader, reader.uint32());
          } else {
            reader.skipType(t & 7);
          }
        }
        break;
      }
      case 3: { // setActivitySettings
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) result.setActivitySettings = reader.bool();
          else reader.skipType(t & 7);
        }
        break;
      }
      case 4: { // getAllActivitySettings
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) result.getAllActivitySettings = reader.bool();
          else reader.skipType(t & 7);
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

// --- Notification decoding ---

export interface SettingsNotification {
  activitySettings?: ActivitySettings;
}

export function decodeNotification(data: Uint8Array): SettingsNotification {
  const reader = _m0.Reader.create(data);
  const result: SettingsNotification = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if ((tag >>> 3) === 1) { // activitySettings
      const len = reader.uint32();
      const end = reader.pos + len;
      while (reader.pos < end) {
        const t = reader.uint32();
        if ((t >>> 3) === 1) {
          result.activitySettings = decodeActivitySettings(reader, reader.uint32());
        } else {
          reader.skipType(t & 7);
        }
      }
    } else {
      reader.skipType(tag & 7);
    }
  }
  return result;
}
