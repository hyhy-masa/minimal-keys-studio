/**
 * Protobuf codec for the `zmk__fwinfo` custom subsystem — the firmware-version
 * read used by the "update available?" check.
 *
 * ── FROZEN WIRE FORMAT (2026-07-09) ─────────────────────────────────────────
 * This schema is deliberately frozen so Studio can ship the *reader* NOW and
 * have it start working automatically once a firmware that implements EXACTLY
 * this subsystem reaches a customer's keyboard — with no Studio re-update
 * (forward compatibility). The firmware side (a small ZMK custom subsystem,
 * planned after S1.5) MUST implement this byte-for-byte. Basis: design doc
 * `03-design-fable5.md §3.5` (FirmwareInfo{source,version,git_rev,build_date,
 * is_central}).
 *
 *   message Request {
 *     GetFirmwareInfoRequest get_firmware_info = 1;
 *   }
 *   message GetFirmwareInfoRequest { bool include_peripherals = 1; }
 *
 *   message Response {
 *     Error error = 1;                          // { string message = 1; }
 *     repeated FirmwareInfo firmware_info = 2;   // central first, then peripherals
 *   }
 *   message FirmwareInfo {
 *     uint32 source     = 1;   // build source enum (0 = unknown)
 *     string version    = 2;   // e.g. "v1.4.0" (CONFIG_MK_FW_VERSION)
 *     string git_rev    = 3;
 *     string build_date = 4;
 *     bool   is_central = 5;
 *   }
 * ────────────────────────────────────────────────────────────────────────────
 */
import * as _m0 from "protobufjs/minimal";

export const SUBSYSTEM_ID = "zmk__fwinfo";

export interface FirmwareInfo {
  source: number;
  version: string;
  gitRev: string;
  buildDate: string;
  isCentral: boolean;
}

export interface FirmwareInfoResponse {
  error?: string;
  firmwareInfo: FirmwareInfo[];
}

function emptyInfo(): FirmwareInfo {
  return { source: 0, version: "", gitRev: "", buildDate: "", isCentral: false };
}

// --- Request encoding (Studio → firmware) ---

/** Encode a `Request{ get_firmware_info: { include_peripherals } }`. */
export function encodeGetFirmwareInfoRequest(includePeripherals = true): Uint8Array {
  const inner = _m0.Writer.create(); // GetFirmwareInfoRequest
  if (includePeripherals) inner.uint32(8).bool(true); // field 1: include_peripherals
  const w = _m0.Writer.create();
  w.uint32(10).bytes(inner.finish()); // field 1: get_firmware_info (message)
  return w.finish();
}

// --- Response decoding (firmware → Studio) ---

function decodeFirmwareInfo(reader: _m0.Reader, length: number): FirmwareInfo {
  const end = reader.pos + length;
  const info = emptyInfo();
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: info.source = reader.uint32(); break;
      case 2: info.version = reader.string(); break;
      case 3: info.gitRev = reader.string(); break;
      case 4: info.buildDate = reader.string(); break;
      case 5: info.isCentral = reader.bool(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return info;
}

export function decodeFirmwareInfoResponse(data: Uint8Array): FirmwareInfoResponse {
  const reader = _m0.Reader.create(data);
  const result: FirmwareInfoResponse = { firmwareInfo: [] };
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: { // error { string message = 1 }
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const t = reader.uint32();
          if ((t >>> 3) === 1) result.error = reader.string();
          else reader.skipType(t & 7);
        }
        break;
      }
      case 2: { // firmware_info (repeated)
        result.firmwareInfo.push(decodeFirmwareInfo(reader, reader.uint32()));
        break;
      }
      default:
        reader.skipType(tag & 7);
        break;
    }
  }
  return result;
}

/**
 * Reference encoder for the response — this is exactly what the firmware must
 * emit. Kept in the client so both sides share one source of truth and so the
 * decoder can be round-trip tested against it (see fwinfo.test.ts).
 */
export function encodeFirmwareInfoResponse(
  firmwareInfo: FirmwareInfo[],
  error?: string
): Uint8Array {
  const w = _m0.Writer.create();
  if (error !== undefined) {
    const errMsg = _m0.Writer.create();
    errMsg.uint32(10).string(error); // field 1: message
    w.uint32(10).bytes(errMsg.finish()); // field 1: error
  }
  for (const info of firmwareInfo) {
    const m = _m0.Writer.create();
    if (info.source !== 0) m.uint32(8).uint32(info.source);
    if (info.version !== "") m.uint32(18).string(info.version);
    if (info.gitRev !== "") m.uint32(26).string(info.gitRev);
    if (info.buildDate !== "") m.uint32(34).string(info.buildDate);
    if (info.isCentral) m.uint32(40).bool(true);
    w.uint32(18).bytes(m.finish()); // field 2: firmware_info (repeated)
  }
  return w.finish();
}

/** Pick the version to display: the central half's, else the first reported. */
export function pickCentralVersion(infos: FirmwareInfo[]): string | null {
  const central = infos.find((i) => i.isCentral && i.version !== "");
  if (central) return central.version;
  const any = infos.find((i) => i.version !== "");
  return any ? any.version : null;
}
