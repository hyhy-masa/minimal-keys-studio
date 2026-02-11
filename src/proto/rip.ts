/**
 * Protobuf codec for cormoran_rip (Runtime Input Processor) module.
 * Subsystem identifier: "cormoran_rip"
 */
import * as _m0 from "protobufjs/minimal";

export const SUBSYSTEM_ID = "cormoran_rip";

export const AxisSnapMode = {
  NONE: 0,
  X: 1,
  Y: 2,
} as const;
export type AxisSnapMode = (typeof AxisSnapMode)[keyof typeof AxisSnapMode];

export interface InputProcessorInfo {
  id: number;
  name: string;
  scaleMultiplier: number;
  scaleDivisor: number;
  rotationDegrees: number;
  tempLayerEnabled: boolean;
  tempLayerLayer: number;
  tempLayerActivationDelayMs: number;
  tempLayerDeactivationDelayMs: number;
  activeLayers: number;
  axisSnapMode: AxisSnapMode;
  axisSnapThreshold: number;
  axisSnapTimeoutMs: number;
  xyToScrollEnabled: boolean;
  xySwapEnabled: boolean;
  xInvert: boolean;
  yInvert: boolean;
}

export interface LayerInfo {
  index: number;
  name: string;
}

// --- Request encoding ---

export function encodeListInputProcessors(): Uint8Array {
  const w = _m0.Writer.create();
  // field 1: listInputProcessors (empty message)
  w.uint32(10).fork().ldelim();
  return w.finish();
}

export function encodeGetInputProcessor(id: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  const w = _m0.Writer.create();
  w.uint32(18).bytes(inner.finish()); // field 2
  return w.finish();
}

export function encodeSetScaleMultiplier(id: number, value: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (value !== 0) inner.uint32(16).uint32(value);
  const w = _m0.Writer.create();
  w.uint32(26).bytes(inner.finish()); // field 3
  return w.finish();
}

export function encodeSetScaleDivisor(id: number, value: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (value !== 0) inner.uint32(16).uint32(value);
  const w = _m0.Writer.create();
  w.uint32(34).bytes(inner.finish()); // field 4
  return w.finish();
}

export function encodeSetRotation(id: number, value: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (value !== 0) inner.uint32(16).int32(value);
  const w = _m0.Writer.create();
  w.uint32(42).bytes(inner.finish()); // field 5
  return w.finish();
}

export function encodeResetInputProcessor(id: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  const w = _m0.Writer.create();
  w.uint32(50).bytes(inner.finish()); // field 6
  return w.finish();
}

export function encodeSetTempLayerEnabled(id: number, enabled: boolean): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (enabled) inner.uint32(16).bool(enabled);
  const w = _m0.Writer.create();
  w.uint32(58).bytes(inner.finish()); // field 7
  return w.finish();
}

export function encodeSetTempLayerLayer(id: number, layer: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (layer !== 0) inner.uint32(16).uint32(layer);
  const w = _m0.Writer.create();
  w.uint32(66).bytes(inner.finish()); // field 8
  return w.finish();
}

export function encodeSetTempLayerActivationDelay(id: number, delayMs: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (delayMs !== 0) inner.uint32(16).uint32(delayMs);
  const w = _m0.Writer.create();
  w.uint32(74).bytes(inner.finish()); // field 9
  return w.finish();
}

export function encodeSetTempLayerDeactivationDelay(id: number, delayMs: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (delayMs !== 0) inner.uint32(16).uint32(delayMs);
  const w = _m0.Writer.create();
  w.uint32(82).bytes(inner.finish()); // field 10
  return w.finish();
}

export function encodeSetActiveLayers(id: number, layers: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (layers !== 0) inner.uint32(16).uint32(layers);
  const w = _m0.Writer.create();
  w.uint32(90).bytes(inner.finish()); // field 11
  return w.finish();
}

export function encodeGetLayerInfo(): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(98).fork().ldelim(); // field 12: empty message
  return w.finish();
}

export function encodeSetAxisSnapMode(id: number, mode: AxisSnapMode): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (mode !== 0) inner.uint32(16).int32(mode);
  const w = _m0.Writer.create();
  w.uint32(106).bytes(inner.finish()); // field 13
  return w.finish();
}

export function encodeSetAxisSnapThreshold(id: number, threshold: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (threshold !== 0) inner.uint32(16).uint32(threshold);
  const w = _m0.Writer.create();
  w.uint32(114).bytes(inner.finish()); // field 14
  return w.finish();
}

export function encodeSetAxisSnapTimeout(id: number, timeoutMs: number): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (timeoutMs !== 0) inner.uint32(16).uint32(timeoutMs);
  const w = _m0.Writer.create();
  w.uint32(122).bytes(inner.finish()); // field 15
  return w.finish();
}

export function encodeSetXyToScrollEnabled(id: number, enabled: boolean): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (enabled) inner.uint32(16).bool(enabled);
  const w = _m0.Writer.create();
  w.uint32(130).bytes(inner.finish()); // field 16 = tag (16 << 3 | 2) = 130
  return w.finish();
}

export function encodeSetXySwapEnabled(id: number, enabled: boolean): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (enabled) inner.uint32(16).bool(enabled);
  const w = _m0.Writer.create();
  w.uint32(138).bytes(inner.finish()); // field 17
  return w.finish();
}

export function encodeSetXInvert(id: number, invert: boolean): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (invert) inner.uint32(16).bool(invert);
  const w = _m0.Writer.create();
  w.uint32(146).bytes(inner.finish()); // field 18
  return w.finish();
}

export function encodeSetYInvert(id: number, invert: boolean): Uint8Array {
  const inner = _m0.Writer.create();
  if (id !== 0) inner.uint32(8).uint32(id);
  if (invert) inner.uint32(16).bool(invert);
  const w = _m0.Writer.create();
  w.uint32(154).bytes(inner.finish()); // field 19
  return w.finish();
}

// --- Response decoding ---

function decodeInputProcessorInfo(reader: _m0.Reader, length: number): InputProcessorInfo {
  const end = reader.pos + length;
  const info: InputProcessorInfo = {
    id: 0, name: "", scaleMultiplier: 0, scaleDivisor: 0,
    rotationDegrees: 0, tempLayerEnabled: false, tempLayerLayer: 0,
    tempLayerActivationDelayMs: 0, tempLayerDeactivationDelayMs: 0,
    activeLayers: 0, axisSnapMode: 0, axisSnapThreshold: 0,
    axisSnapTimeoutMs: 0, xyToScrollEnabled: false,
    xySwapEnabled: false, xInvert: false, yInvert: false,
  };
  while (reader.pos < end) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: info.id = reader.uint32(); break;
      case 2: info.name = reader.string(); break;
      case 3: info.scaleMultiplier = reader.uint32(); break;
      case 4: info.scaleDivisor = reader.uint32(); break;
      case 5: info.rotationDegrees = reader.int32(); break;
      case 6: info.tempLayerEnabled = reader.bool(); break;
      case 7: info.tempLayerLayer = reader.uint32(); break;
      case 8: info.tempLayerActivationDelayMs = reader.uint32(); break;
      case 9: info.tempLayerDeactivationDelayMs = reader.uint32(); break;
      case 10: info.activeLayers = reader.uint32(); break;
      case 11: info.axisSnapMode = reader.int32() as AxisSnapMode; break;
      case 12: info.axisSnapThreshold = reader.uint32(); break;
      case 13: info.axisSnapTimeoutMs = reader.uint32(); break;
      case 14: info.xyToScrollEnabled = reader.bool(); break;
      case 15: info.xySwapEnabled = reader.bool(); break;
      case 16: info.xInvert = reader.bool(); break;
      case 17: info.yInvert = reader.bool(); break;
      default: reader.skipType(tag & 7); break;
    }
  }
  return info;
}

export interface RipResponse {
  error?: string;
  getInputProcessor?: InputProcessorInfo;
  getLayerInfo?: LayerInfo[];
}

export function decodeResponse(data: Uint8Array): RipResponse {
  const reader = _m0.Reader.create(data);
  const result: RipResponse = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: { // error
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) result.error = reader.string();
          else reader.skipType(innerTag & 7);
        }
        break;
      }
      case 3: { // getInputProcessor
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) {
            result.getInputProcessor = decodeInputProcessorInfo(reader, reader.uint32());
          } else {
            reader.skipType(innerTag & 7);
          }
        }
        break;
      }
      case 13: { // getLayerInfo
        const len = reader.uint32();
        const end = reader.pos + len;
        const layers: LayerInfo[] = [];
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) {
            const layerLen = reader.uint32();
            const layerEnd = reader.pos + layerLen;
            const layer: LayerInfo = { index: 0, name: "" };
            while (reader.pos < layerEnd) {
              const lt = reader.uint32();
              switch (lt >>> 3) {
                case 1: layer.index = reader.uint32(); break;
                case 2: layer.name = reader.string(); break;
                default: reader.skipType(lt & 7); break;
              }
            }
            layers.push(layer);
          } else {
            reader.skipType(innerTag & 7);
          }
        }
        result.getLayerInfo = layers;
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

export interface RipNotification {
  inputProcessorChanged?: InputProcessorInfo;
}

export function decodeNotification(data: Uint8Array): RipNotification {
  const reader = _m0.Reader.create(data);
  const result: RipNotification = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 1: { // inputProcessorChanged
        const len = reader.uint32();
        const end = reader.pos + len;
        while (reader.pos < end) {
          const innerTag = reader.uint32();
          if ((innerTag >>> 3) === 1) {
            result.inputProcessorChanged = decodeInputProcessorInfo(reader, reader.uint32());
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
