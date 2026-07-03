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

// The ts-client mutex means only one request is on the wire at a time, and the
// timeout below must measure *transfer* time, not time spent waiting in that
// queue. If the timer started while a heavy request (e.g. a full getKeymap) was
// still transferring, a light request queued behind it could hit the timeout —
// and force-disconnect — before it ever reached the wire. So we serialize the
// call_rpc entry points here too: each request starts its timer only once the
// previous one has settled, i.e. when the mutex is actually free.
let rpcQueue: Promise<unknown> = Promise.resolve();

export async function call_rpc(
  conn: RpcConnection,
  req: Omit<Request, "requestId">,
  timeoutMs: number = RPC_TIMEOUT_MS
): Promise<RequestResponse> {
  const run = rpcQueue.then(() => exec_call_rpc(conn, req, timeoutMs));
  // Always advance the queue, even if this request rejects, so one failure
  // does not wedge every later request.
  rpcQueue = run.catch(() => {});
  return run;
}

async function exec_call_rpc(
  conn: RpcConnection,
  req: Omit<Request, "requestId">,
  timeoutMs: number
): Promise<RequestResponse> {
  const inner = inner_call_rpc(conn, req);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      console.error(`[RPC] timeout after ${timeoutMs}ms -> force disconnect`);
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
