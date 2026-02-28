/**
 * Protobuf codec for cormoran_rsr (Runtime Sensor Rotate) module.
 * Subsystem identifier: "cormoran_rsr"
 *
 * Proto definition: cormoran/rsr/custom.proto
 *
 * Request oneof:
 *   field 1: SetLayerCwBindingRequest
 *   field 2: SetLayerCcwBindingRequest
 *   field 3: GetAllLayerBindingsRequest
 *   field 4: GetSensorsRequest
 *
 * Response oneof:
 *   field 1: ErrorResponse
 *   field 2: SetLayerCwBindingResponse
 *   field 3: SetLayerCcwBindingResponse
 *   field 4: GetAllLayerBindingsResponse
 *   field 5: GetSensorsResponse
 */
import * as _m0 from "protobufjs/minimal";

export const SUBSYSTEM_ID = "cormoran_rsr";

export interface Binding {
  behaviorId: number;
  param1: number;
  param2: number;
  tapMs: number;
}

export interface LayerBindings {
  layer: number;
  cwBinding: Binding | null;
  ccwBinding: Binding | null;
}

export interface SensorInfo {
  index: number;
  name: string;
}

// --- Binding encode/decode helpers ---

function encodeBinding(binding: Binding): Uint8Array {
  const w = _m0.Writer.create();
  if (binding.behaviorId !== 0) w.uint32(8).uint32(binding.behaviorId);
  if (binding.param1 !== 0) w.uint32(16).uint32(binding.param1);
  if (binding.param2 !== 0) w.uint32(24).uint32(binding.param2);
  if (binding.tapMs !== 0) w.uint32(32).uint32(binding.tapMs);
  return w.finish();
}

function decodeBinding(reader: _m0.Reader, length: number): Binding {
  const end = reader.pos + length;
  const binding: Binding = { behaviorId: 0, param1: 0, param2: 0, tapMs: 0 };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: binding.behaviorId = reader.uint32(); break;
      case 2: binding.param1 = reader.uint32(); break;
      case 3: binding.param2 = reader.uint32(); break;
      case 4: binding.tapMs = reader.uint32(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return binding;
}

// --- Request encoding ---

/** GetSensorsRequest (field 4 of Request oneof) */
export function encodeGetSensors(): Uint8Array {
  const w = _m0.Writer.create();
  // field 4: GetSensorsRequest (empty message)
  w.uint32(34).fork().ldelim();
  return w.finish();
}

/** GetAllLayerBindingsRequest (field 3 of Request oneof) */
export function encodeGetAllLayerBindings(sensorIndex: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (sensorIndex !== 0) inner.uint32(8).uint32(sensorIndex);
  const w = _m0.Writer.create();
  w.uint32(26).bytes(inner.finish()); // field 3
  return w.finish();
}

/** SetLayerCwBindingRequest (field 1 of Request oneof) */
export function encodeSetLayerCwBinding(
  sensorIndex: number,
  layer: number,
  binding: Binding
): Uint8Array {
  const inner = _m0.Writer.create();
  if (sensorIndex !== 0) inner.uint32(8).uint32(sensorIndex);
  if (layer !== 0) inner.uint32(16).uint32(layer);
  inner.uint32(26).bytes(encodeBinding(binding)); // field 3: Binding
  const w = _m0.Writer.create();
  w.uint32(10).bytes(inner.finish()); // field 1
  return w.finish();
}

/** SetLayerCcwBindingRequest (field 2 of Request oneof) */
export function encodeSetLayerCcwBinding(
  sensorIndex: number,
  layer: number,
  binding: Binding
): Uint8Array {
  const inner = _m0.Writer.create();
  if (sensorIndex !== 0) inner.uint32(8).uint32(sensorIndex);
  if (layer !== 0) inner.uint32(16).uint32(layer);
  inner.uint32(26).bytes(encodeBinding(binding)); // field 3: Binding
  const w = _m0.Writer.create();
  w.uint32(18).bytes(inner.finish()); // field 2
  return w.finish();
}

// --- Response decoding ---

export interface RsrResponse {
  error?: string;
  setLayerCwBinding?: { success: boolean };
  setLayerCcwBinding?: { success: boolean };
  getAllLayerBindings?: { bindings: LayerBindings[] };
  getSensors?: { sensors: SensorInfo[] };
}

function decodeLayerBindings(reader: _m0.Reader, length: number): LayerBindings {
  const end = reader.pos + length;
  const lb: LayerBindings = { layer: 0, cwBinding: null, ccwBinding: null };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: lb.layer = reader.uint32(); break;
      case 2: lb.cwBinding = decodeBinding(reader, reader.uint32()); break;
      case 3: lb.ccwBinding = decodeBinding(reader, reader.uint32()); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return lb;
}

function decodeSensorInfo(reader: _m0.Reader, length: number): SensorInfo {
  const end = reader.pos + length;
  const info: SensorInfo = { index: 0, name: "" };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: info.index = reader.uint32(); break;
      case 2: info.name = reader.string(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return info;
}

export function decodeResponse(data: Uint8Array): RsrResponse {
  const reader = _m0.Reader.create(data);
  const result: RsrResponse = {};
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
      case 2: { // SetLayerCwBindingResponse
        const len = reader.uint32();
        const end = reader.pos + len;
        let success = false;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) success = reader.bool();
          else reader.skipType(innerTag & 7);
        }
        result.setLayerCwBinding = { success };
        break;
      }
      case 3: { // SetLayerCcwBindingResponse
        const len = reader.uint32();
        const end = reader.pos + len;
        let success = false;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) success = reader.bool();
          else reader.skipType(innerTag & 7);
        }
        result.setLayerCcwBinding = { success };
        break;
      }
      case 4: { // GetAllLayerBindingsResponse
        const len = reader.uint32();
        const end = reader.pos + len;
        const bindings: LayerBindings[] = [];
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) {
            bindings.push(decodeLayerBindings(reader, reader.uint32()));
          } else {
            reader.skipType(innerTag & 7);
          }
        }
        result.getAllLayerBindings = { bindings };
        break;
      }
      case 5: { // GetSensorsResponse
        const len = reader.uint32();
        const end = reader.pos + len;
        const sensors: SensorInfo[] = [];
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) {
            sensors.push(decodeSensorInfo(reader, reader.uint32()));
          } else {
            reader.skipType(innerTag & 7);
          }
        }
        result.getSensors = { sensors };
        break;
      }
      default:
        reader.skipType(tag & 7);
        break;
    }
  }
  return result;
}
