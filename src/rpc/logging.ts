import {
  call_rpc as inner_call_rpc,
  Request,
  RequestResponse,
  RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";

export const RPC_TIMEOUT_MS = 8000;

export class RpcTimeoutError extends Error {
  constructor() {
    super("RPC request timed out");
    Object.setPrototypeOf(this, RpcTimeoutError.prototype);
  }
}

// The ts-client serializes every RPC through a process-global mutex, so a
// request that never gets a response wedges ALL later requests. The only way
// to release the mutex is to tear the transport down; the app registers its
// disconnect routine here so a timeout can trigger it.
let forceDisconnect: (() => void) | null = null;

export function registerForceDisconnect(fn: (() => void) | null): void {
  forceDisconnect = fn;
}

export async function call_rpc(
  conn: RpcConnection,
  req: Omit<Request, "requestId">,
  timeoutMs: number = RPC_TIMEOUT_MS
): Promise<RequestResponse> {
  const inner = inner_call_rpc(conn, req);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      forceDisconnect?.();
      reject(new RpcTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([inner, timeout]);
  } finally {
    clearTimeout(timer);
    // After a timeout wins the race, the aborted inner promise still rejects
    // later; swallow it so it never surfaces as an unhandled rejection.
    inner.catch(() => {});
  }
}
