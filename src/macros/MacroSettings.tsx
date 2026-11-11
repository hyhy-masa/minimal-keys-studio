import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ListVideo, Plus, X } from "lucide-react";
import * as Macros from "../proto/macros";
import { useMacros } from "./MacrosContext";
import { deleteMacro, failureMessage, writeMacro, type StoredMacro } from "./macro-client";
import {
  SPEEDS,
  WAIT_PRESETS_MS,
  clampWaitStep,
  estimateMs,
  firstFreeSlot,
  formatSeconds,
  newRowId,
  rowsToSteps,
  slotLabel,
  speedOf,
  stepsToRows,
  type MacroRow,
} from "./macro-model";
import {
  loadTextLayout,
  saveTextLayout,
  truncateToBytes,
  utf8ByteLength,
  type TextLayout,
} from "./macro-text";
import { rowLabel } from "./macro-labels";
import { useToast } from "../misc/Toast";
import { useOsMode } from "../OsModeContext";
import { useBehaviorList } from "../behaviors/BehaviorsContext";
import { ComboActionPicker } from "../combos/ComboActionPicker";
import { ConfirmDialog } from "../ConfirmDialog";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const BTN = `inline-flex min-h-11 items-center justify-center gap-1 rounded px-3 text-sm ${FOCUS_RING}`;
const BTN_PRIMARY = `${BTN} bg-primary text-primary-content hover:opacity-90 disabled:opacity-50`;
const BTN_PLAIN = `${BTN} border border-base-300 bg-base-100 hover:bg-base-200 disabled:opacity-50`;
const ICON_BTN = `inline-flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-base-200 disabled:opacity-30 ${FOCUS_RING}`;

interface Draft {
  index: number;
  isNew: boolean;
  name: string;
  tapMs: number;
  waitMs: number;
  rows: MacroRow[];
}

function snapshot(d: Draft | null): string {
  if (!d) return "";
  return JSON.stringify({
    name: d.name,
    tapMs: d.tapMs,
    waitMs: d.waitMs,
    rows: d.rows.map((r) => ({ ...r, id: undefined })),
  });
}

function draftFromMacro(m: StoredMacro, layout: TextLayout): Draft {
  return {
    index: m.index,
    isNew: false,
    name: m.name,
    tapMs: m.tapMs || Macros.DEFAULT_TAP_MS,
    waitMs: m.waitMs || Macros.DEFAULT_WAIT_MS,
    rows: stepsToRows(m.steps, layout),
  };
}

function newDraft(index: number): Draft {
  return {
    index,
    isNew: true,
    name: "",
    tapMs: Macros.DEFAULT_TAP_MS,
    waitMs: Macros.DEFAULT_WAIT_MS,
    rows: [],
  };
}

const KIND_LABEL: Record<MacroRow["kind"], string> = {
  text: "文字",
  key: "キー",
  wait: "待つ",
  raw: "",
};

interface MacroSettingsProps {
  /** Opens the app's firmware update wizard. Absent when updating is not available. */
  onRequestFirmwareUpdate?: () => void;
  /** Switches to the keymap tab, where a saved macro is assigned to a key. */
  onGoToKeymap?: () => void;
}

// Key Press param1 for Enter (HID keyboard page 0x07, usage 0x28).
const ENTER_KEY = 0x070028;
const GUIDE_HIDDEN_KEY = "macroGuideHidden";

function loadGuideHidden(): boolean {
  try {
    return localStorage.getItem(GUIDE_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function saveGuideHidden(hidden: boolean): void {
  try {
    localStorage.setItem(GUIDE_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    // The guide simply shows again next time.
  }
}

/**
 * The whole flow in one place. The first test on hardware showed that the
 * scattered hints did not tell a customer where to start or how a saved macro
 * reaches a key (2026-11-10).
 */
function MacroGuide({ onTryExample, canTryExample, onHide }: {
  onTryExample: () => void;
  canTryExample: boolean;
  onHide: () => void;
}) {
  return (
    <section aria-label="マクロの作り方" className="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-200/40 p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">マクロの作り方</h3>
        <span className="flex-1" />
        <button type="button" className={`text-sm text-base-content/60 hover:underline ${FOCUS_RING}`} onClick={onHide}>
          説明を閉じる
        </button>
      </div>
      <p className="text-sm text-base-content/70">例として、1つのキーでメールアドレスを打てるようにします。</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        <li>「新しいマクロ」を押して、名前を付けます。（例: メールアドレス）</li>
        <li>打つ中身を、上から順に並べます。（例: 「＋文字」で yamada@example.com、続けて「＋キー」で Enter）</li>
        <li>「保存」を押します。マクロがキーボードに書き込まれます。</li>
        <li>「キーマップ」の画面でキーを選び、「マクロ」タブから M1 などを選びます。最後に、キーマップの「保存」を押します。</li>
      </ol>
      <div>
        <button type="button" className={BTN_PLAIN} disabled={!canTryExample} onClick={onTryExample}>
          例を入れてみる
        </button>
      </div>
    </section>
  );
}

export function MacroSettings({ onRequestFirmwareUpdate, onGoToKeymap }: MacroSettingsProps = {}) {
  const { status, info, macros, refresh, call } = useMacros();
  const { toast } = useToast();
  const { osMode } = useOsMode();
  const behaviors = useBehaviorList();
  const keyPressBehaviors = useMemo(() => behaviors.filter((b) => b.displayName === "Key Press"), [behaviors]);
  const keyPressId = keyPressBehaviors[0]?.id;

  const [layout, setLayout] = useState<TextLayout>(loadTextLayout);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [original, setOriginal] = useState("");
  const [pendingOpen, setPendingOpen] = useState<(() => void) | null>(null);
  const [openKeyRow, setOpenKeyRow] = useState<string | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [guideHidden, setGuideHidden] = useState(loadGuideHidden);
  const [justSaved, setJustSaved] = useState<number | null>(null);
  const composingRef = useRef(false);

  const dirty = draft !== null && (snapshot(draft) !== original || pendingModifiers !== 0);
  const saving = progress !== null;

  const maxMacros = info?.maxMacros ?? Macros.DEFAULT_MAX_MACROS;
  const nameMax = info?.nameMaxBytes ?? Macros.DEFAULT_NAME_MAX_BYTES;
  const maxSteps = info?.maxStepsPerMacro ?? Macros.DEFAULT_MAX_STEPS_PER_MACRO;
  const totalSteps = info?.totalSteps ?? Macros.DEFAULT_TOTAL_STEPS;
  const usedSteps = info?.usedSteps ?? 0;
  const sortedMacros = useMemo(() => [...macros].sort((a, b) => a.index - b.index), [macros]);
  const freeSlot = firstFreeSlot(maxMacros, macros.map((m) => m.index));

  const open = useCallback((next: Draft | null) => {
    setDraft(next);
    setOriginal(snapshot(next));
    setOpenKeyRow(null);
    setPendingModifiers(0);
    setSaveError(null);
    setJustSaved(null);
  }, []);

  /** Runs `action` now, or after asking when there are unsaved changes. */
  const guard = (action: () => void) => {
    if (dirty) setPendingOpen(() => action);
    else action();
  };

  const revert = () => {
    if (!draft) return;
    const stored = draft.isNew ? undefined : macros.find((m) => m.index === draft.index);
    open(stored ? draftFromMacro(stored, layout) : newDraft(draft.index));
  };

  const startNew = () => {
    if (freeSlot !== null) open(newDraft(freeSlot));
  };

  /** Opens a filled-in, unsaved example so the customer sees what a macro looks like. */
  const startExample = () => {
    if (freeSlot === null) return;
    open(newDraft(freeSlot));
    setDraft({
      ...newDraft(freeSlot),
      name: "メールアドレスの例",
      rows: [
        { id: newRowId(), kind: "text", text: "yamada@example.com" },
        { id: newRowId(), kind: "key", value: ENTER_KEY },
      ],
    });
  };

  const hideGuide = () => {
    setGuideHidden(true);
    saveGuideHidden(true);
  };

  const showGuide = () => {
    setGuideHidden(false);
    saveGuideHidden(false);
  };

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const updateRow = (id: string, patch: Partial<MacroRow>) =>
    setDraft((d) => (d ? { ...d, rows: d.rows.map((r) => (r.id === id ? ({ ...r, ...patch } as MacroRow) : r)) } : d));

  const addRow = (row: MacroRow) => {
    setDraft((d) => (d ? { ...d, rows: [...d.rows, row] } : d));
    if (row.kind === "key") {
      setOpenKeyRow(row.id);
      setPendingModifiers(0);
    }
  };

  const moveRow = (from: number, to: number) =>
    setDraft((d) => {
      if (!d || to < 0 || to >= d.rows.length) return d;
      const rows = [...d.rows];
      const [r] = rows.splice(from, 1);
      rows.splice(to, 0, r);
      return { ...d, rows };
    });

  const removeRow = (id: string) => {
    setDraft((d) => (d ? { ...d, rows: d.rows.filter((r) => r.id !== id) } : d));
    if (openKeyRow === id) {
      setOpenKeyRow(null);
      setPendingModifiers(0);
    }
  };

  const changeLayout = (next: TextLayout) => {
    setLayout(next);
    saveTextLayout(next);
    // A macro read from the keyboard is shown again in the new layout, unless edited.
    if (draft && !draft.isNew && !dirty) {
      const stored = macros.find((m) => m.index === draft.index);
      if (stored) open(draftFromMacro(stored, next));
    }
  };

  const conversion = useMemo(() => (draft ? rowsToSteps(draft.rows, layout) : null), [draft, layout]);
  const steps = conversion?.steps ?? [];
  const storedCount = draft && !draft.isNew ? (macros.find((m) => m.index === draft.index)?.steps.length ?? 0) : 0;
  const available = totalSteps - usedSteps + storedCount;

  const saveBlockReason = !draft
    ? null
    : !call
      ? "キーボードとの接続が切れています。つなぎ直すと保存できます。"
      : draft.name.trim() === ""
        ? "名前を入れてください。"
        : draft.rows.length === 0
          ? "手順を1つ以上足してください。"
          : conversion && conversion.invalidChars.size > 0
            ? "赤い文字は打てません。キーボードはキーの位置しか送れないので、日本語や絵文字はパソコンの日本語入力で打ちます。よく使う言葉は、パソコンの「単語登録」を使うと便利です。"
            : draft.rows.some((r) => r.kind === "text" && r.text === "")
              ? "空の「文字」の行があります。文字を入れるか、その行を消してください。"
              : draft.rows.some((r) => r.kind === "key" && !r.value)
                ? "キーを選んでいない行があります。キーを選ぶか、その行を消してください。"
                : steps.length > maxSteps
                  ? `手順が多すぎます。1つのマクロに入るのは${maxSteps}手までです（いまは${steps.length}手）。文字を短くするか、行を減らしてください。`
                  : steps.length > available
                    ? `キーボードの空きが足りません。あと${available}手まで入ります（いまは${steps.length}手）。ほかのマクロを短くするか、削除してください。`
                    : null;

  const handleSave = async () => {
    if (!draft || !call || saveBlockReason) return;
    const target = draft;
    setSaveError(null);
    setProgress({ done: 0, total: Macros.chunkSteps(steps).length + 2 });
    try {
      await writeMacro(
        call,
        { index: target.index, name: target.name, tapMs: target.tapMs, waitMs: target.waitMs, steps },
        (done, total) => setProgress({ done, total }),
      );
      const saved: Draft = { ...target, isNew: false };
      setDraft(saved);
      setOriginal(snapshot(saved));
      setOpenKeyRow(null);
      setPendingModifiers(0);
      setJustSaved(saved.index);
      toast("マクロを保存しました", "success");
      await refresh();
    } catch (e) {
      console.error("[Macros] Save failed:", e);
      setSaveError(`マクロを保存できませんでした。${failureMessage(e)}`);
      toast("マクロの保存に失敗しました", "error");
    } finally {
      setProgress(null);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    if (!draft || draft.isNew || !call) return;
    try {
      await deleteMacro(call, draft.index);
      open(null);
      toast("マクロを削除しました", "success");
      await refresh();
    } catch (e) {
      console.error("[Macros] Delete failed:", e);
      setSaveError(`マクロを削除できませんでした。${failureMessage(e)}`);
      toast("マクロの削除に失敗しました", "error");
    }
  };

  if (status === "unavailable" && !draft) {
    return (
      <CenteredNotice
        title="更新するとマクロが使えます"
        body="このキーボードのファームウェアは、マクロに対応する前の版です。ファームウェアを更新すると、マクロを作れるようになります。"
      >
        <button
          type="button"
          className={BTN_PRIMARY}
          onClick={onRequestFirmwareUpdate}
          disabled={!onRequestFirmwareUpdate}
        >
          ファームウェアを更新する
        </button>
        {!onRequestFirmwareUpdate && (
          <p className="text-sm text-base-content/50">この画面からは更新できません。配布版のアプリから更新してください。</p>
        )}
      </CenteredNotice>
    );
  }

  if (status === "loading" && !draft) {
    return (
      <div className="p-4">
        <p className="text-base-content/50 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (status === "error" && !draft) {
    return (
      <CenteredNotice
        title="マクロの一覧を読めませんでした"
        body="もう一度読んでください。何度やっても読めないときは、キーボードの電源を入れ直してから、もう一度つないでください。"
      >
        <button type="button" className={BTN_PRIMARY} onClick={() => void refresh()}>
          もう一度読む
        </button>
      </CenteredNotice>
    );
  }

  const nameLeft = draft ? nameMax - utf8ByteLength(draft.name) : nameMax;
  const currentSpeed = draft ? speedOf(draft.tapMs, draft.waitMs) : null;

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">マクロ</h2>
        <p className="text-sm text-base-content/60">マクロのキーを押すと、登録した手順を順に打ちます。</p>
        <p className="text-sm text-base-content/60">再生中にどれかのマクロのキーを押すと、そこで止まります。</p>
        <p className="text-sm text-base-content/50">キーへの割り当ては、キーマップかコンボの画面で「マクロ」タブから選びます。</p>
        {guideHidden && (
          <div>
            <button type="button" className={`text-sm text-primary hover:underline ${FOCUS_RING}`} onClick={showGuide}>
              作り方の説明を見る
            </button>
          </div>
        )}
      </div>

      {!guideHidden && (
        <MacroGuide
          onTryExample={() => guard(startExample)}
          canTryExample={freeSlot !== null && !draft?.isNew}
          onHide={hideGuide}
        />
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">パソコンの配列</legend>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["jis", "日本語配列（JIS）"],
              ["us", "英語配列（US）"],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="macro-text-layout"
                checked={layout === id}
                onChange={() => changeLayout(id)}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="text-sm text-base-content/50">パソコン側の設定と同じ配列を選んでください。違うと記号が別の文字になります。</p>
        {layout === "jis" && (
          <p className="text-sm text-base-content/50">Mac で日本語配列のときは、\ が ¥ になることがあります。</p>
        )}
      </fieldset>

      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-2" aria-label="マクロの一覧">
          <ul className="flex flex-col gap-1">
            {sortedMacros.map((m) => (
              <li key={m.index}>
                <button
                  type="button"
                  aria-current={draft?.index === m.index ? "true" : undefined}
                  aria-label={`${slotLabel(m.index)} ${m.name || "（名前なし）"}`}
                  className={`flex w-full min-h-11 items-center gap-2 rounded border px-3 text-left text-sm ${FOCUS_RING} ${
                    draft?.index === m.index ? "border-primary bg-primary/10 font-medium" : "border-base-300 hover:bg-base-200"
                  }`}
                  onClick={() => guard(() => open(draftFromMacro(m, layout)))}
                >
                  <span className="font-mono">{slotLabel(m.index)}</span>
                  <span className="truncate">{m.name || "（名前なし）"}</span>
                </button>
              </li>
            ))}
            {draft?.isNew && (
              <li>
                <div className="flex min-h-11 items-center gap-2 rounded border border-primary bg-primary/10 px-3 text-sm font-medium">
                  <span className="font-mono">{slotLabel(draft.index)}</span>
                  <span className="truncate">{draft.name || "新しいマクロ"}</span>
                </div>
              </li>
            )}
          </ul>
          {sortedMacros.length === 0 && !draft && (
            <p className="text-sm text-base-content/50">まだマクロがありません。</p>
          )}
          <button
            type="button"
            className={BTN_PLAIN}
            disabled={freeSlot === null || !!draft?.isNew}
            onClick={() => guard(startNew)}
          >
            <Plus className="w-4 h-4" />
            新しいマクロ
          </button>
          {freeSlot === null && (
            <p className="text-sm text-base-content/60">マクロは最大{maxMacros}個です。追加するには、どれかを削除してください。</p>
          )}
          <p className="text-sm text-base-content/60" aria-label={`使用 ${usedSteps} 手、上限 ${totalSteps} 手`}>
            使用 {usedSteps} / {totalSteps} 手
          </p>
          <p className="text-sm text-base-content/50">文字は1文字で1手です。</p>
        </aside>

        <section className="flex min-w-0 flex-col gap-4" aria-label="手順">
          {!draft ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-base-300 py-10 text-center">
              <ListVideo className="w-8 h-8 text-base-content/30" />
              <p className="text-sm text-base-content/60">左の一覧からマクロを選ぶか、「新しいマクロ」を押してください。</p>
              <p className="text-sm text-base-content/50">初めてのときは、上の「例を入れてみる」を押すと、できあがりの形が見られます。</p>
            </div>
          ) : (
            <>
              <h3 className="text-base font-semibold">
                {slotLabel(draft.index)} {draft.isNew ? "新しいマクロ" : "マクロを編集"}
              </h3>

              {saveError && (
                <div role="alert" className="rounded border border-error/40 bg-error/5 px-3 py-2 text-sm text-error">
                  {saveError}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label htmlFor="macro-name" className="text-sm font-medium">名前</label>
                <div className="flex items-center gap-3">
                  <input
                    id="macro-name"
                    type="text"
                    value={draft.name}
                    placeholder="例: メールアドレス"
                    className="min-h-11 flex-1 rounded border px-2 text-sm"
                    onCompositionStart={() => { composingRef.current = true; }}
                    onCompositionEnd={(e) => {
                      composingRef.current = false;
                      update({ name: truncateToBytes(e.currentTarget.value, nameMax) });
                    }}
                    onChange={(e) =>
                      update({ name: composingRef.current ? e.target.value : truncateToBytes(e.target.value, nameMax) })
                    }
                  />
                  <span className="text-sm text-base-content/60 shrink-0" aria-live="polite">
                    残り {Math.max(0, nameLeft)}
                  </span>
                </div>
                <p className="text-sm text-base-content/50">英数字は1文字で1、日本語は1文字で3使います。</p>
              </div>

              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-medium">速さ</legend>
                <div className="flex flex-wrap gap-4">
                  {SPEEDS.map((s) => (
                    <label key={s.id} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="macro-speed"
                        checked={currentSpeed?.id === s.id}
                        onChange={() => update({ tapMs: s.tapMs, waitMs: s.waitMs })}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
                {!currentSpeed && (
                  <p className="text-sm text-base-content/50">
                    いまの速さ: 押す時間 {draft.tapMs}ms・次までの間 {draft.waitMs}ms
                  </p>
                )}
                <p className="text-sm text-base-content/50">パソコンが打ち漏らすときは、ゆっくりにしてください。</p>
              </fieldset>

              <ol className="flex flex-col gap-2" aria-label="手順の一覧">
                {draft.rows.map((row, i) => (
                  <StepRow
                    key={row.id}
                    row={row}
                    position={i + 1}
                    isFirst={i === 0}
                    isLast={i === draft.rows.length - 1}
                    invalid={conversion?.invalidChars.get(row.id) ?? []}
                    keyPickerOpen={openKeyRow === row.id}
                    onToggleKeyPicker={() => {
                      setPendingModifiers(0);
                      setOpenKeyRow((cur) => (cur === row.id ? null : row.id));
                    }}
                    onChange={(patch) => updateRow(row.id, patch)}
                    onUp={() => moveRow(i, i - 1)}
                    onDown={() => moveRow(i, i + 1)}
                    onRemove={() => removeRow(row.id)}
                    label={rowLabel(row, osMode)}
                  >
                    {row.kind === "key" && openKeyRow === row.id && keyPressId !== undefined && (
                      <ComboActionPicker
                        binding={row.value ? { behaviorId: keyPressId, param1: row.value, param2: 0 } : null}
                        pendingModifiers={pendingModifiers}
                        onPendingModifiersChange={setPendingModifiers}
                        onBindingChange={(b) => {
                          if (b.behaviorId === keyPressId) updateRow(row.id, { value: b.param1 >>> 0 });
                        }}
                        behaviors={keyPressBehaviors}
                        layers={[]}
                        keysOnly
                      />
                    )}
                  </StepRow>
                ))}
              </ol>
              {draft.rows.length === 0 && (
                <p className="text-sm text-base-content/50">下のボタンで手順を足してください。</p>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_PLAIN} onClick={() => addRow({ id: newRowId(), kind: "text", text: "" })}>
                  ＋文字
                </button>
                <button type="button" className={BTN_PLAIN} onClick={() => addRow({ id: newRowId(), kind: "key", value: 0 })}>
                  ＋キー
                </button>
                <button type="button" className={BTN_PLAIN} onClick={() => addRow({ id: newRowId(), kind: "wait", ms: 300 })}>
                  ＋待つ
                </button>
              </div>
              <ul className="flex flex-col gap-0.5 text-sm text-base-content/60" aria-label="手順の種類">
                <li>＋文字: 入れた文字を、そのまま打ちます（英数字と記号）。</li>
                <li>＋キー: Enter や Ctrl+C のようなキーを、1回押します。</li>
                <li>＋待つ: 次の手順まで、少し待ちます（アプリが開くのを待つときなど）。</li>
              </ul>

              <p className="text-sm">
                再生にかかる時間 約 {formatSeconds(estimateMs(steps, draft.tapMs, draft.waitMs))} 秒
                <span className="text-base-content/50">（{steps.length}手）</span>
              </p>

              <p className="flex items-center gap-1 text-sm text-warning-content">
                <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
                パスワードやカード番号は入れないでください（キーボードを押せば誰でも打てます）。
              </p>

              {justSaved === draft.index && !dirty && (
                <div role="status" className="flex flex-col gap-2 rounded border border-success/40 bg-success/5 px-3 py-2 text-sm">
                  <p className="font-medium">{slotLabel(draft.index)} を保存しました。次は、このマクロをキーに割り当てます。</p>
                  <p>キーマップの画面でキーを選び、「マクロ」タブから {slotLabel(draft.index)} を選んでください。最後に、キーマップの「保存」を押します。</p>
                  {onGoToKeymap && (
                    <div>
                      <button type="button" className={BTN_PRIMARY} onClick={onGoToKeymap}>
                        キーマップで割り当てる
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-base-300 bg-base-100 py-2">
                {saveBlockReason && <p className="text-sm text-base-content/70">{saveBlockReason}</p>}
                {progress && progress.total > 3 && (
                  <p className="text-sm text-base-content/60" aria-live="polite">
                    保存中… {progress.done} / {progress.total}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={BTN_PLAIN}
                    disabled={!dirty || saving}
                    onClick={revert}
                  >
                    元に戻す
                  </button>
                  <button
                    type="button"
                    className={`${BTN} text-error hover:bg-error/10 disabled:opacity-50`}
                    disabled={draft.isNew || saving || !call}
                    onClick={() => setConfirmDelete(true)}
                  >
                    削除
                  </button>
                  <span className="flex-1" />
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    disabled={saving || !!saveBlockReason}
                    onClick={() => void handleSave()}
                  >
                    {saving ? "保存中…" : "保存"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="マクロを削除"
        destructive
        confirmLabel="削除する"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>このマクロをキーボードから削除します。この操作は元に戻せません。</p>
        <p>このマクロを割り当てたキーは、押しても何も起きなくなります。</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingOpen !== null}
        title="変更を破棄"
        destructive
        confirmLabel="破棄する"
        cancelLabel="編集を続ける"
        onConfirm={() => {
          const action = pendingOpen;
          setPendingOpen(null);
          action?.();
        }}
        onCancel={() => setPendingOpen(null)}
      >
        <p>保存していない変更があります。破棄して移りますか？</p>
      </ConfirmDialog>
    </div>
  );
}

function StepRow({
  row,
  position,
  isFirst,
  isLast,
  invalid,
  label,
  keyPickerOpen,
  onToggleKeyPicker,
  onChange,
  onUp,
  onDown,
  onRemove,
  children,
}: {
  row: MacroRow;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  invalid: number[];
  label: string;
  keyPickerOpen: boolean;
  onToggleKeyPicker: () => void;
  onChange: (patch: Partial<MacroRow>) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const kindLabel = row.kind === "raw" ? (row.type === Macros.STEP_PRESS ? "押したまま" : row.type === Macros.STEP_RELEASE ? "離す" : "そのほか") : KIND_LABEL[row.kind];
  const invalidSet = new Set(invalid);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 px-3 py-2" aria-label={`${position}. ${kindLabel}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-6 text-sm text-base-content/50">{position}.</span>
        <span className="w-20 text-sm font-medium">{kindLabel}</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {row.kind === "text" && (
            <input
              type="text"
              aria-label={`${position}行目の文字`}
              aria-invalid={invalid.length > 0}
              value={row.text}
              placeholder="例: yamada@example.com"
              className={`min-h-11 min-w-0 flex-1 rounded border px-2 text-sm ${invalid.length ? "border-error" : ""}`}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          )}
          {row.kind === "key" && (
            <>
              <span className="text-sm">{label}</span>
              <button type="button" className={BTN_PLAIN} aria-expanded={keyPickerOpen} onClick={onToggleKeyPicker}>
                {keyPickerOpen ? "閉じる" : row.value ? "キーを変える" : "キーを選ぶ"}
              </button>
            </>
          )}
          {row.kind === "wait" && (
            <>
              {WAIT_PRESETS_MS.map((ms) => (
                <button
                  key={ms}
                  type="button"
                  aria-pressed={row.ms === ms}
                  className={`${BTN} border ${row.ms === ms ? "border-primary bg-primary/10 font-medium" : "border-base-300"}`}
                  onClick={() => onChange({ ms })}
                >
                  {ms >= 1000 ? `${ms / 1000}秒` : `${ms}ms`}
                </button>
              ))}
              <input
                type="number"
                aria-label={`${position}行目の待つ時間（ミリ秒）`}
                min={Macros.MIN_WAIT_STEP_MS}
                max={Macros.MAX_WAIT_STEP_MS}
                value={row.ms}
                className="min-h-11 w-24 rounded border px-2 text-sm"
                onChange={(e) => {
                  if (e.target.value === "") return;
                  onChange({ ms: clampWaitStep(Number(e.target.value)) });
                }}
              />
              <span className="text-sm text-base-content/50">ms（1〜10000）</span>
            </>
          )}
          {row.kind === "raw" && <span className="text-sm">{label}</span>}
        </div>
        <div className="flex items-center">
          <button type="button" className={ICON_BTN} aria-label={`${position}行目を上へ`} disabled={isFirst} onClick={onUp}>
            <ArrowUp className="w-4 h-4" />
          </button>
          <button type="button" className={ICON_BTN} aria-label={`${position}行目を下へ`} disabled={isLast} onClick={onDown}>
            <ArrowDown className="w-4 h-4" />
          </button>
          <button type="button" className={`${ICON_BTN} text-error/70`} aria-label={`${position}行目を消す`} onClick={onRemove}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {row.kind === "text" && invalid.length > 0 && (
        <p className="text-sm" data-testid="macro-invalid-preview">
          {Array.from(row.text).map((ch, i) =>
            invalidSet.has(i) ? (
              <mark key={i} className="rounded bg-error/20 px-0.5 text-error">{ch}</mark>
            ) : (
              <span key={i}>{ch}</span>
            ),
          )}
          <span className="ml-2 text-error">赤い文字は打てません。</span>
        </p>
      )}
      {row.kind === "raw" && (
        <p className="text-sm text-base-content/50">この手順はこの画面では変えられません。消すことはできます。</p>
      )}
      {children}
    </li>
  );
}

function CenteredNotice({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-8">
      <div className="w-16 h-16 rounded-full bg-base-200 flex items-center justify-center">
        <ListVideo className="w-8 h-8 text-base-content/30" />
      </div>
      <div className="text-center max-w-md">
        <h3 className="text-lg font-medium text-base-content/80 mb-2">{title}</h3>
        <p className="text-sm text-base-content/50">{body}</p>
      </div>
      {children}
    </div>
  );
}
