/**
 * Protobuf codec for cormoran_ble (BLE Management) module.
 * Subsystem identifier: "cormoran_ble"
 */
import * as _m0 from "protobufjs/minimal";

export const SUBSYSTEM_ID = "cormoran_ble";

export const OutputPriority = {
  USB: 0,
  BLE: 1,
} as const;
export type OutputPriority = (typeof OutputPriority)[keyof typeof OutputPriority];

export interface ProfileInfo {
  index: number;
  name: string;
  address: string;
  isConnected: boolean;
  isOpen: boolean;
  isActive: boolean;
}

export interface SplitInfo {
  isSplit: boolean;
  isCentral: boolean;
  peripheralConnected: boolean;
  centralBonded: boolean;
}

// --- Request encoding ---

export function encodeGetProfiles(): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(10).fork().ldelim(); // field 1: empty message
  return w.finish();
}

export function encodeSetProfileName(index: number, name: string): Uint8Array {
  const inner = _m0.Writer.create();
  if (index !== 0) inner.uint32(8).uint32(index);
  if (name !== "") inner.uint32(18).string(name);
  const w = _m0.Writer.create();
  w.uint32(18).bytes(inner.finish()); // field 2
  return w.finish();
}

export function encodeSwitchProfile(index: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (index !== 0) inner.uint32(8).uint32(index);
  const w = _m0.Writer.create();
  w.uint32(26).bytes(inner.finish()); // field 3
  return w.finish();
}

export function encodeUnpairProfile(index: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (index !== 0) inner.uint32(8).uint32(index);
  const w = _m0.Writer.create();
  w.uint32(34).bytes(inner.finish()); // field 4
  return w.finish();
}

export function encodeGetSplitInfo(): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(42).fork().ldelim(); // field 5
  return w.finish();
}

export function encodeForgetSplitBond(): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(50).fork().ldelim(); // field 6
  return w.finish();
}

export function encodeSetOutputPriority(priority: OutputPriority): Uint8Array {
  const inner = _m0.Writer.create();
  if (priority !== 0) inner.uint32(8).int32(priority);
  const w = _m0.Writer.create();
  w.uint32(58).bytes(inner.finish()); // field 7
  return w.finish();
}

export function encodeGetOutputPriority(): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(66).fork().ldelim(); // field 8
  return w.finish();
}

// --- Response decoding ---

function decodeProfileInfo(reader: _m0.Reader, length: number): ProfileInfo {
  const end = reader.pos + length;
  const p: ProfileInfo = {
    index: 0, name: "", address: "", isConnected: false, isOpen: false, isActive: false,
  };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: p.index = reader.uint32(); break;
      case 2: p.name = reader.string(); break;
      case 3: p.address = reader.string(); break;
      case 4: p.isConnected = reader.bool(); break;
      case 5: p.isOpen = reader.bool(); break;
      case 6: p.isActive = reader.bool(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return p;
}

function decodeSplitInfo(reader: _m0.Reader, length: number): SplitInfo {
  const end = reader.pos + length;
  const s: SplitInfo = {
    isSplit: false, isCentral: false, peripheralConnected: false, centralBonded: false,
  };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: s.isSplit = reader.bool(); break;
      case 2: s.isCentral = reader.bool(); break;
      case 3: s.peripheralConnected = reader.bool(); break;
      case 4: s.centralBonded = reader.bool(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return s;
}

export interface BleResponse {
  error?: string;
  getProfiles?: { profiles: ProfileInfo[]; maxProfiles: number };
  setProfileName?: boolean;
  switchProfile?: boolean;
  unpairProfile?: boolean;
  getSplitInfo?: SplitInfo;
  forgetSplitBond?: boolean;
  setOutputPriority?: boolean;
  getOutputPriority?: OutputPriority;
}

export function decodeResponse(data: Uint8Array): BleResponse {
  const reader = _m0.Reader.create(data);
  const result: BleResponse = {};
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
      case 2: { // getProfiles
        const len = reader.uint32();
        const end = reader.pos + len;
        const profiles: ProfileInfo[] = [];
        let maxProfiles = 0;
        while (reader.pos < end) {
          const t = reader.uint32();
          switch (t >>> 3) {
            case 1: profiles.push(decodeProfileInfo(reader, reader.uint32())); break;
            case 2: maxProfiles = reader.uint32(); break;
            default: reader.skipType(t & 7); break;
          }
        }
        result.getProfiles = { profiles, maxProfiles };
        break;
      }
      case 3: { // setProfileName
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) result.setProfileName = reader.bool();
          else reader.skipType(t & 7);
        }
        break;
      }
      case 4: { // switchProfile
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) result.switchProfile = reader.bool();
          else reader.skipType(t & 7);
        }
        break;
      }
      case 5: { // unpairProfile
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) result.unpairProfile = reader.bool();
          else reader.skipType(t & 7);
        }
        break;
      }
      case 6: { // getSplitInfo
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) {
            result.getSplitInfo = decodeSplitInfo(reader, reader.uint32());
          } else {
            reader.skipType(t & 7);
          }
        }
        break;
      }
      case 7: { // forgetSplitBond
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) result.forgetSplitBond = reader.bool();
          else reader.skipType(t & 7);
        }
        break;
      }
      case 8: { // setOutputPriority
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) result.setOutputPriority = reader.bool();
          else reader.skipType(t & 7);
        }
        break;
      }
      case 9: { // getOutputPriority
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) result.getOutputPriority = reader.int32() as OutputPriority;
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
