import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MetaError,
  NoResponseError,
  type Request,
  type RequestResponse,
  type RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";
import {
  call_rpc,
  registerForceDisconnect,
  RpcTimeoutError,
} from "./logging";

vi.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  MetaError: class MetaError extends Error {
    constructor(readonly condition: number) {
      super(`Meta error: ${condition}`);
    }
  },
  NoResponseError: class NoResponseError extends Error {
    constructor() {
      super("No RPC response received");
    }
  },
  call_rpc: vi.fn(() => new Promise(() => {})),
}));

const req = { core: { getLockState: true } };

function createConnection(): {
  conn: RpcConnection;
  writes: Request[];
  respond: (response: RequestResponse) => void;
  close: () => void;
} {
  const writes: Request[] = [];
  let responseController!: ReadableStreamDefaultController<RequestResponse>;

  const request_response_readable = new ReadableStream<RequestResponse>({
    start(controller) {
      responseController = controller;
    },
  });
  const request_writable = new WritableStream<Request>({
    write(request) {
      writes.push(request);
    },
  });

  return {
    conn: {
      label: "test",
      request_response_readable,
      request_writable,
      notification_readable: new ReadableStream(),
      current_request: 0,
    },
    writes,
    respond: (response) => responseController.enqueue(response),
    close: () => responseController.close(),
  };
}

async function waitForWrites(writes: Request[], count: number): Promise<void> {
  for (let i = 0; i < 20 && writes.length < count; i += 1) {
    await Promise.resolve();
  }
  expect(writes).toHaveLength(count);
}

describe("call_rpc", () => {
  afterEach(() => {
    registerForceDisconnect(null);
    vi.useRealTimers();
  });

  it("resolves a normal response with the matching requestId", async () => {
    const { conn, writes, respond } = createConnection();

    const pending = call_rpc(conn, req);
    await waitForWrites(writes, 1);
    const response = { requestId: writes[0].requestId } as RequestResponse;
    respond(response);

    await expect(pending).resolves.toBe(response);
  });

  it("sends and resolves request B after request A times out", async () => {
    vi.useFakeTimers();
    const { conn, writes, respond } = createConnection();

    const requestA = call_rpc(conn, req, 100);
    const assertionA = expect(requestA).rejects.toBeInstanceOf(RpcTimeoutError);
    await waitForWrites(writes, 1);
    await vi.advanceTimersByTimeAsync(100);
    await assertionA;

    const requestB = call_rpc(conn, req, 100);
    await waitForWrites(writes, 2);
    respond({ requestId: writes[1].requestId } as RequestResponse);

    await expect(requestB).resolves.toEqual({ requestId: writes[1].requestId });
  });

  it("discards a late response for A and returns B's response to B", async () => {
    vi.useFakeTimers();
    const { conn, writes, respond } = createConnection();

    const requestA = call_rpc(conn, req, 100);
    const assertionA = expect(requestA).rejects.toBeInstanceOf(RpcTimeoutError);
    await waitForWrites(writes, 1);
    const requestAId = writes[0].requestId;
    await vi.advanceTimersByTimeAsync(100);
    await assertionA;

    const requestB = call_rpc(conn, req, 100);
    await waitForWrites(writes, 2);
    const requestBId = writes[1].requestId;
    respond({ requestId: requestAId } as RequestResponse);
    respond({ requestId: requestBId } as RequestResponse);

    await expect(requestB).resolves.toEqual({ requestId: requestBId });
  });

  it("rejects with RpcTimeoutError when no response arrives", async () => {
    vi.useFakeTimers();
    const { conn, writes } = createConnection();

    const pending = call_rpc(conn, req, 25);
    const assertion = expect(pending).rejects.toBeInstanceOf(RpcTimeoutError);
    await waitForWrites(writes, 1);
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
  });

  it("rejects every pending request when the response stream closes", async () => {
    const { conn, writes, close } = createConnection();

    const first = call_rpc(conn, req);
    const second = call_rpc(conn, req);
    await waitForWrites(writes, 1);
    close();

    await expect(first).rejects.toThrow("RPC response stream closed");
    await expect(second).rejects.toThrow("RPC session disposed");
  });

  it.each([
    ["noResponse", { noResponse: true }, NoResponseError],
    ["simpleError", { simpleError: 0 }, MetaError],
  ])("maps meta.%s to the client error class", async (_name, meta, ErrorClass) => {
    const { conn, writes, respond } = createConnection();

    const pending = call_rpc(conn, req);
    await waitForWrites(writes, 1);
    respond({ requestId: writes[0].requestId, meta } as RequestResponse);

    await expect(pending).rejects.toBeInstanceOf(ErrorClass);
  });

  it("does not call forceDisconnect after a timeout", async () => {
    vi.useFakeTimers();
    const { conn, writes } = createConnection();
    const forceDisconnect = vi.fn();
    registerForceDisconnect(forceDisconnect);

    const pending = call_rpc(conn, req, 25);
    const assertion = expect(pending).rejects.toBeInstanceOf(RpcTimeoutError);
    await waitForWrites(writes, 1);
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    expect(forceDisconnect).not.toHaveBeenCalled();
  });
});
