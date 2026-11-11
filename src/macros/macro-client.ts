/**
 * The request sequences of the mk__macros subsystem, independent of React so
 * they can be tested with a fake RPC.
 */
import * as Macros from "../proto/macros";

export type RpcCall = (payload: Uint8Array, timeoutMs?: number) => Promise<Uint8Array>;

export interface StoredMacro {
  index: number;
  name: string;
  tapMs: number;
  waitMs: number;
  steps: Macros.Step[];
}

/** The firmware answered with an ErrorResponse (or something unexpected, code 0). */
export class MacroRpcError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message || `macro rpc error ${code}`);
    this.name = "MacroRpcError";
    this.code = code;
  }
}

const TIMEOUT_MS = 5000;

async function request(call: RpcCall, payload: Uint8Array): Promise<Macros.MacrosResponse> {
  const resp = Macros.decodeResponse(await call(payload, TIMEOUT_MS));
  if (resp.error) throw new MacroRpcError(resp.error.code, resp.error.message);
  return resp;
}

export async function readInfo(call: RpcCall): Promise<Macros.MacroInfo> {
  const resp = await request(call, Macros.encodeGetInfo());
  if (!resp.info) throw new MacroRpcError(0, "no info in response");
  return resp.info;
}

/** Reads one macro, 16 steps per request, until step_count is reached. */
export async function readMacro(call: RpcCall, index: number): Promise<StoredMacro> {
  const steps: Macros.Step[] = [];
  let header: Macros.MacroPart | null = null;
  for (;;) {
    const resp = await request(call, Macros.encodeGetMacro(index, steps.length));
    const part = resp.macro;
    if (!part) throw new MacroRpcError(0, "no macro in response");
    header ??= part;
    steps.push(...part.steps);
    if (steps.length >= header.stepCount) break;
    // A response that adds nothing would loop forever.
    if (part.steps.length === 0) throw new MacroRpcError(0, "macro read stalled");
  }
  return {
    index,
    name: header.name,
    tapMs: header.tapMs,
    waitMs: header.waitMs,
    steps: steps.slice(0, header.stepCount),
  };
}

export async function readAll(call: RpcCall): Promise<{ info: Macros.MacroInfo; macros: StoredMacro[] }> {
  const info = await readInfo(call);
  const macros: StoredMacro[] = [];
  for (const s of [...info.macros].sort((a, b) => a.index - b.index)) {
    macros.push(await readMacro(call, s.index));
  }
  return { info, macros };
}

/**
 * Writes a macro: begin_set, then append_steps in order, then commit.
 * `onProgress(done, total)` counts requests. Returns used_steps from the commit.
 */
export async function writeMacro(
  call: RpcCall,
  def: { index: number; name: string; tapMs: number; waitMs: number; steps: Macros.Step[] },
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const payloads = Macros.encodeWriteSequence(def);
  let usedSteps = 0;
  for (let i = 0; i < payloads.length; i++) {
    const resp = await request(call, payloads[i]);
    if (!resp.ok) throw new MacroRpcError(0, "no ok in response");
    usedSteps = resp.ok.usedSteps;
    onProgress?.(i + 1, payloads.length);
  }
  return usedSteps;
}

export async function deleteMacro(call: RpcCall, index: number): Promise<void> {
  const resp = await request(call, Macros.encodeDelete(index));
  if (!resp.ok) throw new MacroRpcError(0, "no ok in response");
}

/** The Japanese text for a failed request. */
export function failureMessage(e: unknown): string {
  if (e instanceof MacroRpcError && e.code !== 0) return Macros.errorMessage(e.code);
  return "キーボードから返事がありませんでした。接続を確かめて、もう一度試してください。";
}
