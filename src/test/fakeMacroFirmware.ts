/**
 * An in-memory stand-in for the firmware's mk__macros handler
 * (zmk-module-runtime-macros src/studio/custom_handler.c), for tests.
 *
 * It parses requests with protobufjs directly, not with src/proto/macros.ts,
 * so a codec bug shows up as a mismatch instead of cancelling itself out.
 */
import * as _m0 from "protobufjs/minimal";

export interface FakeStep {
  type: number;
  value: number;
}

export interface FakeMacro {
  name: string;
  tapMs: number;
  waitMs: number;
  steps: FakeStep[];
}

export interface FakeRequest {
  kind: "get_info" | "get_macro" | "begin_set" | "append_steps" | "commit" | "delete" | "unknown";
  fields: Map<number, number | string>;
  steps: FakeStep[];
  bytes: number;
}

const KINDS: FakeRequest["kind"][] = ["unknown", "get_info", "get_macro", "begin_set", "append_steps", "commit", "delete"];

export function parseRequest(payload: Uint8Array): FakeRequest {
  const outer = _m0.Reader.create(payload);
  const tag = outer.uint32();
  const kind = KINDS[tag >>> 3] ?? "unknown";
  const inner = _m0.Reader.create(outer.bytes());
  const fields = new Map<number, number | string>();
  const steps: FakeStep[] = [];
  while (inner.pos < inner.len) {
    const t = inner.uint32();
    const f = t >>> 3;
    if (kind === "begin_set" && f === 2) fields.set(2, inner.string());
    else if (kind === "append_steps" && f === 3) {
      const s = _m0.Reader.create(inner.bytes());
      const step = { type: 0, value: 0 };
      while (s.pos < s.len) {
        const st = s.uint32();
        if (st >>> 3 === 1) step.type = s.uint32();
        else if (st >>> 3 === 2) step.value = s.uint32() >>> 0;
        else s.skipType(st & 7);
      }
      steps.push(step);
    } else if ((t & 7) === 0) fields.set(f, inner.uint32() >>> 0);
    else inner.skipType(t & 7);
  }
  return { kind, fields, steps, bytes: payload.length };
}

const num = (r: FakeRequest, f: number) => (r.fields.get(f) as number | undefined) ?? 0;

function wrapResp(field: number, inner: Uint8Array): Uint8Array {
  return _m0.Writer.create().uint32((field << 3) | 2).bytes(inner).finish();
}

export function errorBytes(code: number, message = "err"): Uint8Array {
  return wrapResp(1, _m0.Writer.create().uint32(8).uint32(code).uint32(18).string(message).finish());
}

export class FakeMacroFirmware {
  macros = new Map<number, FakeMacro>();
  maxMacros = 16;
  maxStepsPerMacro = 128;
  totalSteps = 512;
  nameMaxBytes = 32;
  requests: FakeRequest[] = [];
  /** Return an error code for the n-th request of a kind (0-based), or undefined. */
  failOn?: (r: FakeRequest) => number | undefined;
  private staging: { index: number; macro: FakeMacro; count: number } | null = null;

  usedSteps(): number {
    let n = 0;
    for (const m of this.macros.values()) n += m.steps.length;
    return n;
  }

  private ok(): Uint8Array {
    const inner = _m0.Writer.create();
    const used = this.usedSteps();
    if (used) inner.uint32(8).uint32(used);
    return wrapResp(4, inner.finish());
  }

  handle = async (payload: Uint8Array): Promise<Uint8Array> => {
    const r = parseRequest(payload);
    this.requests.push(r);
    const forced = this.failOn?.(r);
    if (forced) return errorBytes(forced);
    switch (r.kind) {
      case "get_info": {
        const w = _m0.Writer.create();
        w.uint32(8).uint32(1);
        w.uint32(16).uint32(this.maxMacros);
        w.uint32(24).uint32(this.maxStepsPerMacro);
        w.uint32(32).uint32(this.totalSteps);
        if (this.usedSteps()) w.uint32(40).uint32(this.usedSteps());
        w.uint32(48).uint32(this.nameMaxBytes);
        for (const [index, m] of [...this.macros].sort((a, b) => a[0] - b[0])) {
          const s = _m0.Writer.create();
          if (index) s.uint32(8).uint32(index);
          if (m.steps.length) s.uint32(16).uint32(m.steps.length);
          w.uint32(58).bytes(s.finish());
        }
        return wrapResp(2, w.finish());
      }
      case "get_macro": {
        const index = num(r, 1);
        const offset = num(r, 2);
        const m = this.macros.get(index);
        if (!m) return errorBytes(7, "empty slot");
        const w = _m0.Writer.create();
        if (index) w.uint32(8).uint32(index);
        if (m.name) w.uint32(18).string(m.name);
        w.uint32(24).uint32(m.tapMs);
        w.uint32(32).uint32(m.waitMs);
        w.uint32(40).uint32(m.steps.length);
        if (offset) w.uint32(48).uint32(offset);
        for (const s of m.steps.slice(offset, offset + 16)) {
          const sw = _m0.Writer.create();
          if (s.type) sw.uint32(8).uint32(s.type);
          if (s.value) sw.uint32(16).uint32(s.value);
          w.uint32(58).bytes(sw.finish());
        }
        return wrapResp(3, w.finish());
      }
      case "begin_set": {
        const count = num(r, 5);
        if (count === 0 || count > this.maxStepsPerMacro) return errorBytes(2, "step count out of range");
        this.staging = {
          index: num(r, 1),
          count,
          macro: { name: (r.fields.get(2) as string) ?? "", tapMs: num(r, 3), waitMs: num(r, 4), steps: [] },
        };
        return this.ok();
      }
      case "append_steps": {
        const st = this.staging;
        if (!st || num(r, 1) !== st.index || num(r, 2) !== st.macro.steps.length) {
          this.staging = null;
          return errorBytes(5, "steps out of order");
        }
        st.macro.steps.push(...r.steps);
        return this.ok();
      }
      case "commit": {
        const st = this.staging;
        this.staging = null;
        if (!st || num(r, 1) !== st.index || st.macro.steps.length !== st.count) return errorBytes(5, "macro incomplete");
        const others = this.usedSteps() - (this.macros.get(st.index)?.steps.length ?? 0);
        if (others + st.count > this.totalSteps) return errorBytes(3, "no space");
        this.macros.set(st.index, st.macro);
        return this.ok();
      }
      case "delete":
        this.macros.delete(num(r, 1));
        return this.ok();
      default:
        return errorBytes(1, "unsupported request");
    }
  };

  kinds(): string[] {
    return this.requests.map((r) => r.kind);
  }
}
