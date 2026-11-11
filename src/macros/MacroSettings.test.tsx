import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMacroFirmware } from "../test/fakeMacroFirmware";
import * as Macros from "../proto/macros";
import { textToValues } from "./macro-text";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  currentSubsystem: undefined as unknown,
}));

vi.mock("../rpc/useCustomSubsystem", () => ({
  useCustomSubsystem: () => mocks.currentSubsystem,
}));

vi.mock("../misc/Toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("../behaviors/BehaviorsContext", () => ({
  useBehaviorList: () => [
    { id: 3, displayName: "Key Press", metadata: [] },
    { id: 9, displayName: "Macro", metadata: [] },
  ],
}));

// The full key picker is tested elsewhere; here one key is enough.
vi.mock("../behaviors/BehaviorBindingPicker", () => ({
  BehaviorBindingPicker: ({ onBindingChanged }: { onBindingChanged: (b: object) => void }) => (
    <button onClick={() => onBindingChanged({ behaviorId: 3, param1: 0x070006, param2: 0 })}>pick-c</button>
  ),
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

import { MacroSettings } from "./MacroSettings";
import { MacrosProvider } from "./MacrosProvider";

let fw: FakeMacroFirmware;
const store = new Map<string, string>();

beforeEach(() => {
  mocks.toast.mockReset();
  fw = new FakeMacroFirmware();
  mocks.currentSubsystem = { subsystemIndex: 2, callRPC: (p: Uint8Array) => fw.handle(p) };
  store.clear();
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    writable: true,
    configurable: true,
  });
});

function renderTab(props: { onRequestFirmwareUpdate?: () => void; onGoToKeymap?: () => void } = {}) {
  return render(
    <MacrosProvider>
      <MacroSettings {...props} />
    </MacrosProvider>,
  );
}

const tap = (value: number) => ({ type: Macros.STEP_TAP, value });
const textTaps = (s: string, layout: "jis" | "us" = "jis") => textToValues(s, layout).values.map(tap);
const ENTER = 0x070028;

async function startNew(name = "メール") {
  fireEvent.click(await screen.findByRole("button", { name: "新しいマクロ" }));
  fireEvent.change(screen.getByLabelText("名前"), { target: { value: name } });
}

function addText(text: string) {
  fireEvent.click(screen.getByRole("button", { name: "＋文字" }));
  const inputs = screen.getAllByLabelText(/行目の文字$/);
  fireEvent.change(inputs[inputs.length - 1], { target: { value: text } });
}

function stepLabels(): string[] {
  return within(screen.getByRole("list", { name: "手順の一覧" }))
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("aria-label") ?? "");
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
}

describe("MacroSettings — screens", () => {
  it("without the macro subsystem it offers a firmware update", async () => {
    mocks.currentSubsystem = null;
    const onUpdate = vi.fn();
    renderTab({ onRequestFirmwareUpdate: onUpdate });
    expect(screen.getByText("更新するとマクロが使えます")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ファームウェアを更新する" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("without the update entry the update button is disabled", () => {
    mocks.currentSubsystem = null;
    renderTab();
    expect(screen.getByRole("button", { name: "ファームウェアを更新する" })).toBeDisabled();
  });

  it("a failed read shows a retry that reads again", async () => {
    let fail = true;
    fw.failOn = () => (fail ? Macros.ERR_SAVE_FAILED : undefined);
    renderTab();
    expect(await screen.findByText("マクロの一覧を読めませんでした")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "もう一度読む" }));
    expect(await screen.findByRole("button", { name: "新しいマクロ" })).toBeInTheDocument();
  });

  it("lists stored macros as M1 名前 with the capacity line and the stop sentence", async () => {
    fw.macros.set(0, { name: "メール", tapMs: 30, waitMs: 40, steps: textTaps("a@b.jp") });
    fw.macros.set(2, { name: "列幅", tapMs: 30, waitMs: 40, steps: [tap(ENTER)] });
    renderTab();
    expect(await screen.findByRole("button", { name: "M1 メール" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "M3 列幅" })).toBeInTheDocument();
    expect(screen.getByText("使用 7 / 512 手")).toBeInTheDocument();
    expect(screen.getByText("再生中にどれかのマクロのキーを押すと、そこで止まります。")).toBeInTheDocument();
  });
});

describe("MacroSettings — editing", () => {
  it("creates a macro with text, a key and a wait, and saves it in order", async () => {
    renderTab();
    await startNew("メール");
    addText("ab@");
    fireEvent.click(screen.getByRole("button", { name: "＋キー" }));
    fireEvent.click(screen.getByRole("button", { name: "Enter" }));
    fireEvent.click(screen.getByRole("button", { name: "＋待つ" }));
    fireEvent.click(screen.getByRole("button", { name: "500ms" }));
    expect(stepLabels()).toEqual(["1. 文字", "2. キー", "3. 待つ"]);
    save();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("マクロを保存しました", "success"));
    expect(fw.kinds()).toEqual(["get_info", "begin_set", "append_steps", "commit", "get_info", "get_macro"]);
    expect(fw.macros.get(0)).toEqual({
      name: "メール",
      tapMs: 30,
      waitMs: 40,
      steps: [...textTaps("ab@"), tap(ENTER), { type: Macros.STEP_WAIT, value: 500 }],
    });
    expect(await screen.findByRole("button", { name: "M1 メール" })).toBeInTheDocument();
  });

  it("the キー step uses the combo picker and keeps chosen modifiers", async () => {
    renderTab();
    await startNew();
    fireEvent.click(screen.getByRole("button", { name: "＋キー" }));
    fireEvent.click(screen.getByRole("button", { name: "Ctrl" }));
    expect(screen.getByText(/キーを選んでいない行があります/)).toBeInTheDocument();
    expect(screen.queryByText(/レイヤー操作/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "pick-c" }));
    save();
    await waitFor(() => expect(fw.macros.get(0)?.steps).toEqual([tap(0x01070006)]));
  });

  it("moves rows up and down and deletes them", async () => {
    renderTab();
    await startNew();
    addText("a");
    fireEvent.click(screen.getByRole("button", { name: "＋待つ" }));
    fireEvent.click(screen.getByRole("button", { name: "2行目を上へ" }));
    expect(stepLabels()).toEqual(["1. 待つ", "2. 文字"]);
    fireEvent.click(screen.getByRole("button", { name: "1行目を下へ" }));
    expect(stepLabels()).toEqual(["1. 文字", "2. 待つ"]);
    expect(screen.getByRole("button", { name: "1行目を上へ" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "1行目を消す" }));
    expect(stepLabels()).toEqual(["1. 待つ"]);
  });

  it("a wait can be typed in ms and is kept within 1–10000", async () => {
    renderTab();
    await startNew();
    fireEvent.click(screen.getByRole("button", { name: "＋待つ" }));
    const field = screen.getByLabelText("1行目の待つ時間（ミリ秒）");
    fireEvent.change(field, { target: { value: "25000" } });
    expect(field).toHaveValue(10000);
    save();
    await waitFor(() => expect(fw.macros.get(0)?.steps).toEqual([{ type: Macros.STEP_WAIT, value: 10000 }]));
  });

  it("Japanese text is marked and blocks saving with the reason", async () => {
    renderTab();
    await startNew();
    addText("山田a");
    expect(screen.getByLabelText("1行目の文字")).toHaveAttribute("aria-invalid", "true");
    const preview = screen.getByTestId("macro-invalid-preview");
    expect(within(preview).getAllByText(/^(山|田)$/).every((el) => el.tagName === "MARK")).toBe(true);
    expect(screen.getByText(/キーボードはキーの位置しか送れない/)).toBeInTheDocument();
    expect(screen.getByText(/単語登録/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("the name is cut by UTF-8 bytes without splitting a character", async () => {
    renderTab();
    await startNew("あいうえおかきくけこさ"); // 33 bytes
    expect(screen.getByLabelText("名前")).toHaveValue("あいうえおかきくけこ");
    expect(screen.getByText("残り 2")).toBeInTheDocument();
  });

  it("saving needs a name and at least one step", async () => {
    renderTab();
    await startNew("");
    expect(screen.getByText("名前を入れてください。")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "x" } });
    expect(screen.getByText("手順を1つ以上足してください。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("the speed choice is sent and changes the estimated time", async () => {
    renderTab();
    await startNew();
    addText("abcde");
    expect(screen.getByText(/再生にかかる時間 約 0\.4 秒/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("とてもゆっくり"));
    expect(screen.getByText(/再生にかかる時間 約 1\.3 秒/)).toBeInTheDocument();
    save();
    await waitFor(() => expect(fw.macros.get(0)).toMatchObject({ tapMs: 100, waitMs: 150 }));
  });

  it("the PC layout choice changes the keys sent and is remembered", async () => {
    renderTab();
    fireEvent.click(await screen.findByLabelText("英語配列（US）"));
    expect(store.get("macroTextLayout")).toBe("us");
    await startNew();
    addText("@");
    save();
    await waitFor(() => expect(fw.macros.get(0)?.steps).toEqual(textTaps("@", "us")));
    expect(fw.macros.get(0)?.steps).not.toEqual(textTaps("@", "jis"));
  });

  it("explains the per-macro step limit before sending", async () => {
    fw.maxStepsPerMacro = 4;
    renderTab();
    await startNew();
    addText("abcde");
    expect(screen.getByText(/1つのマクロに入るのは4手までです（いまは5手）/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("explains the remaining space on the keyboard before sending", async () => {
    fw.totalSteps = 20;
    fw.macros.set(0, { name: "a", tapMs: 30, waitMs: 40, steps: textTaps("abcdefghijklmnopqr") });
    renderTab();
    await startNew();
    addText("xyz");
    expect(screen.getByText(/あと2手まで入ります（いまは3手）/)).toBeInTheDocument();
  });

  it("an error code from the keyboard is shown in plain Japanese and the input stays", async () => {
    fw.failOn = (r) => (r.kind === "commit" ? Macros.ERR_NO_SPACE : undefined);
    renderTab();
    await startNew();
    addText("abc");
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(Macros.errorMessage(Macros.ERR_NO_SPACE));
    expect(mocks.toast).toHaveBeenCalledWith("マクロの保存に失敗しました", "error");
    expect(screen.getByLabelText("1行目の文字")).toHaveValue("abc");
  });

  it("shows progress while a long macro is written", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const handle = fw.handle;
    mocks.currentSubsystem = {
      subsystemIndex: 2,
      callRPC: async (p: Uint8Array) => {
        if (p[0] === 34 && fw.requests.filter((r) => r.kind === "append_steps").length === 1) await gate;
        return handle(p);
      },
    };
    renderTab();
    await startNew();
    addText("abcdefghijklmnopqrst"); // 20 steps: begin + 3 appends + commit
    save();
    expect(await screen.findByText("保存中… 2 / 5")).toBeInTheDocument();
    await act(async () => release());
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("マクロを保存しました", "success"));
  });
});

describe("MacroSettings — reading back and deleting", () => {
  it("shows text, key and press/release rows from the keyboard", async () => {
    fw.macros.set(0, {
      name: "メール",
      tapMs: 30,
      waitMs: 40,
      steps: [...textTaps("yamada@example.com"), tap(ENTER), { type: 2, value: 0x0700e1 }, { type: 3, value: 0x0700e1 }],
    });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "M1 メール" }));
    expect(stepLabels()).toEqual(["1. 文字", "2. キー", "3. 押したまま", "4. 離す"]);
    expect(screen.getByLabelText("1行目の文字")).toHaveValue("yamada@example.com");
    expect(screen.getAllByText("この手順はこの画面では変えられません。消すことはできます。")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
  });

  it("元に戻す returns to what the keyboard has", async () => {
    fw.macros.set(0, { name: "メール", tapMs: 30, waitMs: 40, steps: textTaps("abc") });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "M1 メール" }));
    fireEvent.change(screen.getByLabelText("1行目の文字"), { target: { value: "zzz" } });
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(screen.getByLabelText("1行目の文字")).toHaveValue("abc");
  });

  it("switching macros with unsaved changes asks first", async () => {
    fw.macros.set(0, { name: "a", tapMs: 30, waitMs: 40, steps: textTaps("abc") });
    fw.macros.set(1, { name: "b", tapMs: 30, waitMs: 40, steps: textTaps("xyz") });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "M1 a" }));
    fireEvent.change(screen.getByLabelText("1行目の文字"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "M2 b" }));
    expect(screen.getByRole("dialog", { name: "変更を破棄" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "破棄する" }));
    expect(screen.getByLabelText("1行目の文字")).toHaveValue("xyz");
  });

  it("deletes after confirming and refreshes the list", async () => {
    fw.macros.set(3, { name: "消す", tapMs: 30, waitMs: 40, steps: textTaps("a") });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "M4 消す" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(fw.kinds()).not.toContain("delete");
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("マクロを削除しました", "success"));
    expect(fw.requests.find((r) => r.kind === "delete")?.fields.get(1)).toBe(3);
    await waitFor(() => expect(screen.queryByRole("button", { name: "M4 消す" })).not.toBeInTheDocument());
  });

  it("a new macro uses the first free slot and cannot be deleted before saving", async () => {
    fw.macros.set(0, { name: "a", tapMs: 30, waitMs: 40, steps: textTaps("a") });
    renderTab();
    await startNew("b");
    expect(screen.getByText("M2 新しいマクロ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除" })).toBeDisabled();
  });
});

describe("MacroSettings — guidance", () => {
  it("shows the numbered how-to with the key assignment step", async () => {
    renderTab();
    const guide = await screen.findByRole("region", { name: "マクロの作り方" });
    const items = within(guide).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items).toHaveLength(4);
    expect(items[0]).toContain("新しいマクロ");
    expect(items[3]).toContain("キーマップ");
    expect(items[3]).toContain("保存");
  });

  it("the guide can be closed, stays closed, and comes back", async () => {
    const { unmount } = renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "説明を閉じる" }));
    expect(screen.queryByRole("region", { name: "マクロの作り方" })).not.toBeInTheDocument();
    unmount();
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "作り方の説明を見る" }));
    expect(screen.getByRole("region", { name: "マクロの作り方" })).toBeInTheDocument();
  });

  it("例を入れてみる fills an unsaved example that saves as text + Enter", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "例を入れてみる" }));
    expect(screen.getByLabelText("名前")).toHaveValue("メールアドレスの例");
    expect(stepLabels()).toEqual(["1. 文字", "2. キー"]);
    // Unsaved: the keyboard has nothing until 保存 is pressed.
    expect(fw.macros.size).toBe(0);
    save();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("マクロを保存しました", "success"));
    expect(fw.macros.get(0)?.steps).toEqual([...textTaps("yamada@example.com"), tap(ENTER)]);
  });

  it("explains the three step kinds next to the add buttons", async () => {
    renderTab();
    await startNew();
    const kinds = within(screen.getByRole("list", { name: "手順の種類" })).getAllByRole("listitem");
    expect(kinds.map((k) => k.textContent?.slice(0, 4))).toEqual(["＋文字:", "＋キー:", "＋待つ:"]);
  });

  it("after saving it says what to do next and opens the keymap", async () => {
    const onGoToKeymap = vi.fn();
    renderTab({ onGoToKeymap });
    await startNew("メール");
    addText("a");
    save();
    const next = await screen.findByRole("status");
    expect(next.textContent).toContain("M1 を保存しました");
    expect(next.textContent).toContain("「マクロ」タブから M1");
    fireEvent.click(within(next).getByRole("button", { name: "キーマップで割り当てる" }));
    expect(onGoToKeymap).toHaveBeenCalledTimes(1);
    // Editing again hides it: the message is about the saved state only.
    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "メール2" } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
