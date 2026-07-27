import {
  MetaError,
  NoResponseError,
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

let forceDisconnect: (() => void) | null = null;

export function registerForceDisconnect(fn: (() => void) | null): void {
  forceDisconnect = fn;
  // Kept for public API compatibility. Session timeouts must not invoke it.
  void forceDisconnect;
}

type PendingRequest = {
  resolve: (response: RequestResponse) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
};

class RpcSession {
  private readonly pending = new Map<number, PendingRequest>();
  private readonly reader: ReadableStreamDefaultReader<RequestResponse>;
  private sendQueue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(private readonly conn: RpcConnection) {
    this.reader = conn.request_response_readable.getReader();
    void this.pump();
  }

  call(
    req: Omit<Request, "requestId">,
    timeoutMs: number
  ): Promise<RequestResponse> {
    const run = this.sendQueue.then(() => this.send(req, timeoutMs));
    this.sendQueue = run.catch(() => {});
    return run;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rejectAll(new Error("RPC session disposed"));
    void this.reader.cancel().catch(() => {});
  }

  private async send(
    req: Omit<Request, "requestId">,
    timeoutMs: number
  ): Promise<RequestResponse> {
    if (this.disposed) throw new Error("RPC session disposed");

    const requestId = this.conn.current_request++;
    const request = { ...req, requestId } as Request;
    let pending!: PendingRequest;
    const response = new Promise<RequestResponse>((resolve, reject) => {
      pending = { resolve, reject };
      this.pending.set(requestId, pending);
    });

    const writer = this.conn.request_writable.getWriter();
    try {
      await writer.write(request);
    } catch (error) {
      this.pending.delete(requestId);
      pending.reject(error);
    } finally {
      writer.releaseLock();
    }

    // Start transfer timing only after this request has actually been written.
    if (this.pending.has(requestId)) {
      pending.timer = setTimeout(() => {
        if (!this.pending.delete(requestId)) return;
        pending.reject(new RpcTimeoutError());
      }, timeoutMs);
    }

    return response;
  }

  private async pump(): Promise<void> {
    try {
      while (!this.disposed) {
        const { done, value } = await this.reader.read();
        if (done) {
          this.disposed = true;
          this.rejectAll(new Error("RPC response stream closed"));
          return;
        }
        if (!value || value.requestId === undefined) continue;

        const pending = this.pending.get(value.requestId);
        if (!pending) continue;

        this.pending.delete(value.requestId);
        clearTimeout(pending.timer);
        if (value.meta?.noResponse) {
          pending.reject(new NoResponseError());
        } else if (value.meta?.simpleError !== undefined) {
          pending.reject(new MetaError(value.meta.simpleError));
        } else {
          pending.resolve(value);
        }
      }
    } catch (error) {
      if (!this.disposed) {
        this.disposed = true;
        this.rejectAll(error);
      }
    } finally {
      this.reader.releaseLock();
    }
  }

  private rejectAll(error: unknown): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

const sessions = new WeakMap<RpcConnection, RpcSession>();

export function call_rpc(
  conn: RpcConnection,
  req: Omit<Request, "requestId">,
  timeoutMs: number = RPC_TIMEOUT_MS
): Promise<RequestResponse> {
  let session = sessions.get(conn);
  if (!session) {
    session = new RpcSession(conn);
    sessions.set(conn, session);
  }
  return session.call(req, timeoutMs);
}
