import {
  call_rpc as inner_call_rpc,
  Request,
  RequestResponse,
  RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";

export async function call_rpc(
  conn: RpcConnection,
  req: Omit<Request, "requestId">
): Promise<RequestResponse> {
  return inner_call_rpc(conn, req);
}
