import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as _m0 from "protobufjs/minimal";

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
  toast: vi.fn(),
  currentSubsystem: undefined as unknown,
}));

vi.mock("@zmkfirmware/zmk-studio-ts-client/core", () => ({
  LockState: {
    ZMK_STUDIO_CORE_LOCK_STATE_LOCKED: 0,
    ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED: 1,
  },
}));

vi.mock("../rpc/useCustomSubsystem", () => ({
  useCustomSubsystem: () => mocks.currentSubsystem,
}));

vi.mock("../misc/Toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("../behaviors/BehaviorsContext", () => ({
  useBehaviorList: () => [{ id: 3, displayName: "Key Press", metadata: [] }],
}));

vi.mock("../behaviors/BehaviorBindingPicker", () => ({
  BehaviorBindingPicker: ({ onBindingChanged }: { onBindingChanged: (b: object) => void }) => (
    <button onClick={() => onBindingChanged({ behaviorId: 3, param1: 41, param2: 0 })}>pick-esc</button>
  ),
}));

vi.mock("../rpc/logging", () => ({
  call_rpc: async () => ({
    keymap: { getKeymap: { layers: [{ id: 5, name: "Base" }, { id: 9, name: "Num" }] } },
  }),
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({
    open, title, confirmLabel, cancelLabel = "キャンセル", onConfirm, onCancel,
  }: {
    open: boolean; title: string; confirmLabel: string; cancelLabel?: string;
    onConfirm: () => void; onCancel: () => void;
  }) => {
    if (!open) return null;
    return (
      <div role="dialog" aria-label={title}>
        <button onClick={onCancel}>{cancelLabel}</button>
        <button onClick={onConfirm}>{confirmLabel}</button>
      </div>
    );
  },
}));

import { ComboSettings } from "./ComboSettings";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";

// --- wire helpers (independent of combos.ts) ---

interface StoredCombo {
  comboId: number;
  keys: number[];
  timeoutMs?: number;
  priorIdleMs?: number;
}

function comboBytes(c: StoredCombo): Uint8Array {
  const w = _m0.Writer.create();
  w.uint32(8).uint32(c.comboId);
  w.uint32(18).fork();
  for (const k of c.keys) w.uint32(k);
  w.ldelim();
  w.uint32(24).uint32(c.timeoutMs ?? 200);
  const b = _m0.Writer.create();
  b.uint32(8).uint32(3).uint32(16).uint32(41);
  w.uint32(34).bytes(b.finish());
  if (c.priorIdleMs) w.uint32(56).uint32(c.priorIdleMs);
  return w.finish();
}

function getAllResp(opts: { combos?: StoredCombo[]; version?: number; enabled?: boolean }): Uint8Array {
  const inner = _m0.Writer.create();
  for (const c of opts.combos ?? []) inner.uint32(10).bytes(comboBytes(c));
  if (opts.version) inner.uint32(16).uint32(opts.version);
  if (opts.enabled) inner.uint32(24).bool(true);
  return _m0.Writer.create().uint32(34).bytes(inner.finish()).finish();
}

function setResp(success: boolean): Uint8Array {
  const inner = _m0.Writer.create();
  if (success) inner.uint32(8).bool(true);
  return _m0.Writer.create().uint32(18).bytes(inner.finish()).finish();
}

function errorResp(): Uint8Array {
  const inner = _m0.Writer.create().uint32(10).string("boom").finish();
  return _m0.Writer.create().uint32(10).bytes(inner).finish();
}

/** Field number -> values of the ComboConfig inside a set request. */
function sentCombo(payload: Uint8Array): Map<number, number[]> {
  const outer = _m0.Reader.create(payload);
  outer.uint32();
  const setReq = _m0.Reader.create(outer.bytes());
  setReq.uint32();
  const r = _m0.Reader.create(setReq.bytes());
  const out = new Map<number, number[]>();
  while (r.pos < r.len) {
    const tag = r.uint32();
    const f = tag >>> 3;
    if ((tag & 7) === 2) {
      const sub = r.bytes();
      if (f === 2) {
        const pr = _m0.Reader.create(sub);
        while (pr.pos < pr.len) out.set(2, [...(out.get(2) ?? []), pr.uint32()]);
      } else out.set(f, [-1]);
    } else {
      out.set(f, [...(out.get(f) ?? []), r.uint32()]);
    }
  }
  return out;
}

const isGetAll = (p: Uint8Array) => p[0] === 26;
const isSet = (p: Uint8Array) => p[0] === 10;

function routeRPC(opts: {
  list: Uint8Array | (() => Promise<Uint8Array>);
  set?: Uint8Array;
}) {
  mocks.callRPC.mockImplementation(async (payload: Uint8Array) => {
    if (isGetAll(payload)) return typeof opts.list === "function" ? opts.list() : opts.list;
    if (isSet(payload)) return opts.set ?? setResp(true);
    return setResp(true);
  });
}

function setCalls(): Uint8Array[] {
  return mocks.callRPC.mock.calls.map((c) => c[0] as Uint8Array).filter(isSet);
}

function renderTab(props: { onRequestFirmwareUpdate?: () => void } = {}) {
  return render(
    <ConnectionContext.Provider value={{ conn: {} as never }}>
      <LockStateContext.Provider value={1 as never}>
        <ComboSettings {...props} />
      </LockStateContext.Provider>
    </ConnectionContext.Provider>
  );
}

async function fillNewCombo() {
  fireEvent.click(await screen.findByRole("button", { name: "コンボを追加" }));
  fireEvent.click(screen.getByRole("button", { name: "17" }));
  fireEvent.click(screen.getByRole("button", { name: "18" }));
  fireEvent.click(screen.getByRole("button", { name: "pick-esc" }));
}

const READY = { version: 1, enabled: true };

beforeEach(() => {
  mocks.callRPC.mockReset();
  mocks.toast.mockReset();
  mocks.currentSubsystem = { subsystemIndex: 4, callRPC: (...a: unknown[]) => mocks.callRPC(...a) };
});

describe("ComboSettings — screens by firmware", () => {
  it("8: firmware without the engine fields shows only the update notice and button", async () => {
    routeRPC({ list: getAllResp({}) });
    const onUpdate = vi.fn();
    renderTab({ onRequestFirmwareUpdate: onUpdate });
    expect(await screen.findByText("更新するとコンボが使えます")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ファームウェアを更新する/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /コンボを追加|最初のコンボを作る/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/編集|削除/)).not.toBeInTheDocument();
  });

  it("9: the update button opens the app's firmware update", async () => {
    routeRPC({ list: getAllResp({}) });
    const onUpdate = vi.fn();
    renderTab({ onRequestFirmwareUpdate: onUpdate });
    fireEvent.click(await screen.findByRole("button", { name: /ファームウェアを更新する/ }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("8b: engine present but disabled shows only the stopped notice, no update button", async () => {
    routeRPC({ list: getAllResp({ version: 1, enabled: false }) });
    renderTab({ onRequestFirmwareUpdate: vi.fn() });
    expect(await screen.findByText("このファームではコンボを止めています")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /更新/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /コンボを追加|最初のコンボを作る/ })).not.toBeInTheDocument();
  });

  it("8c: a failed read shows only the read error and a retry, then the matching screen", async () => {
    let fail = true;
    routeRPC({
      list: async () => {
        if (fail) throw new Error("timeout");
        return getAllResp(READY);
      },
    });
    renderTab({ onRequestFirmwareUpdate: vi.fn() });
    expect(await screen.findByText("コンボの一覧を読めませんでした")).toBeInTheDocument();
    expect(screen.queryByText("更新するとコンボが使えます")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /コンボを追加/ })).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "もう一度読む" }));
    expect(await screen.findByRole("button", { name: "コンボを追加" })).toBeInTheDocument();
  });

  it("8c: an error response is also a failed read", async () => {
    routeRPC({ list: errorResp() });
    renderTab();
    expect(await screen.findByText("コンボの一覧を読めませんでした")).toBeInTheDocument();
  });

  it("10: engine version 1 and enabled shows the settings screen", async () => {
    routeRPC({ list: getAllResp({ ...READY, combos: [{ comboId: 1, keys: [17, 18] }] }) });
    renderTab();
    expect(await screen.findByRole("button", { name: "コンボを追加" })).toBeEnabled();
    expect(screen.getByText("1 / 16件")).toBeInTheDocument();
  });
});

describe("ComboSettings — editing and saving", () => {
  it("1: with 16 combos the add button is disabled and the limit is explained", async () => {
    const combos = Array.from({ length: 16 }, (_, i) => ({ comboId: i + 1, keys: [i, i + 20] }));
    routeRPC({ list: getAllResp({ ...READY, combos }) });
    renderTab();
    expect(await screen.findByRole("button", { name: "コンボを追加" })).toBeDisabled();
    expect(screen.getByText(/コンボは最大16件です/)).toBeInTheDocument();
  });

  it("2/3: a new combo saves timeout 200 and require_prior_idle 100", async () => {
    routeRPC({ list: getAllResp(READY) });
    renderTab();
    await fillNewCombo();
    fireEvent.click(screen.getByRole("button", { name: "詳細設定" }));
    expect(screen.getByLabelText("同時押しの受付時間")).toHaveValue("200");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(setCalls()).toHaveLength(1));
    const sent = sentCombo(setCalls()[0]);
    expect(sent.get(2)).toEqual([17, 18]);
    expect(sent.get(3)).toEqual([200]);
    expect(sent.get(7)).toEqual([100]);
  });

  it("2: an out-of-range timeout is clamped before sending", async () => {
    routeRPC({ list: getAllResp(READY) });
    renderTab();
    await fillNewCombo();
    fireEvent.click(screen.getByRole("button", { name: "詳細設定" }));
    fireEvent.change(screen.getByLabelText("同時押しの受付時間（ミリ秒）"), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(setCalls()).toHaveLength(1));
    expect(sentCombo(setCalls()[0]).get(3)).toEqual([500]);
  });

  it("5: the layer bit is set by the layer index, not its id", async () => {
    routeRPC({ list: getAllResp(READY) });
    renderTab();
    await fillNewCombo();
    fireEvent.click(screen.getByRole("button", { name: "詳細設定" }));
    fireEvent.click(screen.getByLabelText("すべてのレイヤー"));
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    fireEvent.click(await screen.findByLabelText("Num")); // id 9, index 1
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(setCalls()).toHaveLength(1));
    expect(sentCombo(setCalls()[0]).get(5)).toEqual([2]);
  });

  it("6: the new id is decided at save time, not when editing starts", async () => {
    routeRPC({ list: getAllResp({ ...READY, combos: [{ comboId: 1, keys: [1, 2] }, { comboId: 2, keys: [3, 4] }] }) });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "コンボを追加" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    fireEvent.click(await screen.findByRole("button", { name: "コンボを追加" }));
    fireEvent.click(screen.getByRole("button", { name: "17" }));
    fireEvent.click(screen.getByRole("button", { name: "18" }));
    fireEvent.click(screen.getByRole("button", { name: "pick-esc" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(setCalls()).toHaveLength(1));
    expect(sentCombo(setCalls()[0]).get(1)).toEqual([3]);
  });

  it("7: success=false is reported as a failure and the editor keeps the input", async () => {
    routeRPC({ list: getAllResp(READY), set: setResp(false) });
    renderTab();
    await fillNewCombo();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("コンボの保存に失敗しました");
    expect(mocks.toast).toHaveBeenCalledWith("コンボの保存に失敗しました", "error");
    expect(mocks.toast).not.toHaveBeenCalledWith("コンボを保存しました", "success");
    expect(screen.getByRole("button", { name: "17 を外す" })).toBeInTheDocument();
  });

  it("1b: when the firmware is full the failed save is explained as the limit", async () => {
    const full = Array.from({ length: 16 }, (_, i) => ({ comboId: i + 1, keys: [i, i + 20] }));
    let reads = 0;
    routeRPC({
      list: async () => (reads++ === 0 ? getAllResp(READY) : getAllResp({ ...READY, combos: full })),
      set: errorResp(),
    });
    renderTab();
    await fillNewCombo();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("コンボは最大16件です");
  });

  it("7: a delete answered with success=false is reported as a failure and the card stays", async () => {
    routeRPC({ list: getAllResp({ ...READY, combos: [{ comboId: 1, keys: [17, 18] }] }) });
    mocks.callRPC.mockImplementation(async (payload: Uint8Array) => {
      if (isGetAll(payload)) return getAllResp({ ...READY, combos: [{ comboId: 1, keys: [17, 18] }] });
      return _m0.Writer.create().uint32(26).bytes(new Uint8Array(0)).finish(); // deleteCombo{success:false}
    });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /を削除$/ }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("コンボの削除に失敗しました", "error"));
    expect(screen.getByRole("button", { name: /を削除$/ })).toBeInTheDocument();
  });

  it("8: without the update entry the update button is still shown, disabled", async () => {
    routeRPC({ list: getAllResp({}) });
    renderTab();
    expect(await screen.findByRole("button", { name: "ファームウェアを更新する" })).toBeDisabled();
  });

  it("11: a stored combo without field 7 shows the default and saves 100", async () => {
    routeRPC({ list: getAllResp({ ...READY, combos: [{ comboId: 4, keys: [17, 18], timeoutMs: 120 }] }) });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /を編集$/ }));
    fireEvent.click(screen.getByRole("button", { name: "詳細設定" }));
    expect(screen.getByText("0.1秒（既定）")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("同時押しの受付時間（ミリ秒）"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(setCalls()).toHaveLength(1));
    const sent = sentCombo(setCalls()[0]);
    expect(sent.get(1)).toEqual([4]);
    expect(sent.get(3)).toEqual([150]);
    expect(sent.get(7)).toEqual([100]);
  });
});
