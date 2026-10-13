import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { ArrowLeft, ChevronDown, Keyboard, Pencil, Plus, Trash2, X } from "lucide-react";
import { SubsystemUnavailable } from "../misc/SubsystemUnavailable";
import { useCustomSubsystem } from "../rpc/useCustomSubsystem";
import { useToast } from "../misc/Toast";
import * as Combos from "../proto/combos";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { useBehaviorList } from "../behaviors/BehaviorsContext";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { formatBindingDetail } from "../behaviors/binding-display";
import { getBehaviorDescription } from "../behaviors/behavior-descriptions";
import { getHidKeyDescription } from "../keyboard/key-descriptions";
import { hid_usage_page_and_id_from_usage } from "../hid-usages";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { call_rpc } from "../rpc/logging";
import { ConfirmDialog } from "../ConfirmDialog";
import { Switch } from "../misc/Switch";
import { Tooltip } from "../misc/Tooltip";
import { MINIMAL_KEYS_KEY_COUNT, MINIMAL_KEYS_POSITIONS } from "../keyboard/minimal-keys-layout";

interface LayerDisplay {
  id: number;
  index: number;
  name: string;
}

interface KeymapInfo {
  layers: LayerDisplay[];
  keyLabels: string[];
  keyCount: number;
}

function useKeymapInfo(behaviors: ReturnType<typeof useBehaviorList>): KeymapInfo {
  const connection = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const [layers, setLayers] = useState<LayerDisplay[]>([]);
  const [baseBindings, setBaseBindings] = useState<BehaviorBinding[]>([]);

  useEffect(() => {
    if (!connection.conn || lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) {
      setLayers([]);
      setBaseBindings([]);
      return;
    }
    let ignore = false;
    async function load() {
      if (!connection.conn) return;
      // getKeymap transfers the full keymap (several KB over BLE) and is by far
      // the heaviest RPC this tab issues; give it a longer budget than the 8s
      // default so a slow-but-alive link is not force-disconnected mid-load.
      const resp = await call_rpc(
        connection.conn,
        { keymap: { getKeymap: true } },
        15000
      );
      if (ignore) return;
      const km = resp?.keymap?.getKeymap;
      if (km?.layers) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setLayers(km.layers.map((l: any, i: number) => ({ id: l.id ?? i, index: i, name: l.name || `Layer ${i}` })));
        if (km.layers[0]?.bindings) {
          setBaseBindings(km.layers[0].bindings);
        }
      }
    }
    load();
    return () => { ignore = true; };
  }, [connection, lockState]);

  const keyLabels = useMemo(() => {
    return baseBindings.map((binding) => {
      const behavior = behaviors.find((b) => b.id === binding.behaviorId);
      if (!behavior) return "?";

      switch (behavior.displayName) {
        case "Key Press": {
          if (!binding.param1) return "?";
          const [rawPage, id] = hid_usage_page_and_id_from_usage(binding.param1);
          const page = rawPage & 0xff;
          return getHidKeyDescription(page, id).roleName;
        }
        case "Mod-Tap":
        case "Hold-Tap":
        case "Layer-Tap": {
          if (!binding.param2) return "?";
          const [rawPage, id] = hid_usage_page_and_id_from_usage(binding.param2);
          const page = rawPage & 0xff;
          return getHidKeyDescription(page, id).roleName;
        }
        case "Momentary Layer":
        case "Toggle Layer":
        case "To Layer":
          return `L${binding.param1}`;
        case "None":
          return "-";
        case "Transparent":
          return "▽";
        default:
          return behavior.displayName.substring(0, 3);
      }
    });
  }, [baseBindings, behaviors]);

  return { layers, keyLabels, keyCount: baseBindings.length || 43 };
}

function getKeyLabel(position: number, keyLabels: string[]): string {
  return keyLabels[position] ?? `${position}`;
}

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function msWithSeconds(ms: number): string {
  return `${ms}ms（${(ms / 1000).toFixed(ms % 100 === 0 ? 1 : 2)}秒）`;
}

function timeoutHint(ms: number): string {
  if (ms <= 100) return "短い";
  if (ms <= 300) return "標準";
  return "長い";
}

function newCombo(): Combos.ComboConfig {
  return {
    comboId: 0, // assigned at save time (nextFreeComboId)
    keyPositions: [],
    timeoutMs: Combos.DEFAULT_TIMEOUT_MS,
    binding: null,
    layerMask: 0,
    slowRelease: false,
    requirePriorIdleMs: Combos.DEFAULT_PRIOR_IDLE_MS,
  };
}

interface ComboSettingsProps {
  /** Opens the app's firmware update wizard. Absent when updating is not available. */
  onRequestFirmwareUpdate?: () => void;
}

export function ComboSettings({ onRequestFirmwareUpdate }: ComboSettingsProps = {}) {
  const subsystem = useCustomSubsystem(Combos.SUBSYSTEM_ID);
  const { toast } = useToast();
  const behaviors = useBehaviorList();
  const { layers, keyLabels, keyCount } = useKeymapInfo(behaviors);

  const [combos, setCombos] = useState<Combos.ComboConfig[]>([]);
  const [load, setLoad] = useState<Combos.ComboListLoad>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [editing, setEditing] = useState<Combos.ComboConfig | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<string>("");
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // layerMask 0 means "every layer", so an emptied layer list needs its own
  // flag to be told apart from "all layers".
  const [allLayers, setAllLayers] = useState(true);

  const callWithTimeout = useCallback(
    async (label: string, payload: Uint8Array, timeoutMs = 5000) => {
      if (!subsystem) throw new Error("No subsystem");
      // The timeout (and its force-disconnect on a truly dead link) is owned by
      // call_rpc; pass it through instead of racing a second timer that could
      // never win. See rpc/logging.ts.
      try {
        const data = await subsystem.callRPC(payload, timeoutMs);
        return Combos.decodeResponse(data);
      } catch (e) {
        console.error(`[Combos] RPC ${label} failed:`, e);
        throw e;
      }
    },
    [subsystem]
  );

  const discoveryVersionRef = useRef(0);

  useEffect(() => {
    if (!subsystem) {
      setCombos([]);
      setPendingDeleteId(null);
      setLoad({ status: "loading" });
      return;
    }
    const version = ++discoveryVersionRef.current;

    async function loadList() {
      setLoad({ status: "loading" });
      try {
        const resp = await callWithTimeout("getAllCombos", Combos.encodeGetAllCombos(), 15000);
        if (version !== discoveryVersionRef.current) return;
        const all = resp.getAllCombos;
        if (!all) {
          // An error response (or anything that is not a list) is a failed read.
          setLoad({ status: "error" });
          return;
        }
        setCombos(all.combos);
        setLoad({
          status: "loaded",
          engineVersion: all.engineVersion,
          engineEnabled: all.engineEnabled,
        });
      } catch (e) {
        if (version === discoveryVersionRef.current) {
          console.error("[Combos] Failed to load:", e);
          setLoad({ status: "error" });
        }
      }
    }
    loadList();
  }, [subsystem, callWithTimeout, reloadToken]);

  const screen = Combos.comboScreen(!!subsystem, load);
  const atLimit = combos.length >= Combos.MAX_COMBOS;

  const startEditing = useCallback((combo: Combos.ComboConfig, isNew: boolean) => {
    setEditingIsNew(isNew);
    setEditing(combo);
    setEditingOriginal(JSON.stringify(combo));
    setAllLayers(combo.layerMask === 0);
    setSaveError(null);
  }, []);

  const handleNew = useCallback(() => {
    if (combos.length >= Combos.MAX_COMBOS) return;
    startEditing(newCombo(), true);
  }, [combos.length, startEditing]);

  const handleEdit = useCallback((combo: Combos.ComboConfig) => {
    startEditing({ ...combo, keyPositions: [...combo.keyPositions] }, false);
  }, [startEditing]);

  const closeEditor = useCallback(() => {
    setEditing(null);
    setSaveError(null);
    setConfirmDiscard(false);
  }, []);

  const handleCancel = useCallback(() => {
    if (editing && JSON.stringify(editing) !== editingOriginal) {
      setConfirmDiscard(true);
      return;
    }
    closeEditor();
  }, [editing, editingOriginal, closeEditor]);

  const saveBlockReason = !editing
    ? null
    : editing.keyPositions.length < 2
      ? "同時に押すキーを2つ以上選んでください。"
      : !editing.binding || editing.binding.behaviorId === 0
        ? "実行する動作を選んでください。"
        : !allLayers && editing.layerMask === 0
          ? "有効にするレイヤーを1つ以上選んでください。"
          : !subsystem
            ? "キーボードとの接続が切れています。つなぎ直すと保存できます。"
            : null;

  const handleSave = useCallback(async () => {
    if (!editing || saveBlockReason) return;
    const isNew = editingIsNew;
    if (isNew && combos.length >= Combos.MAX_COMBOS) {
      setSaveError(`コンボは最大${Combos.MAX_COMBOS}件です。追加するには、既存のコンボを削除してください。`);
      return;
    }
    const toSave = Combos.normalizeForSave({
      ...editing,
      comboId: isNew ? Combos.nextFreeComboId(combos) : editing.comboId,
    });

    setSaving(true);
    setSaveError(null);
    try {
      const resp = await callWithTimeout("setCombo", Combos.encodeSetCombo(toSave));
      if (!Combos.isWriteSuccess(resp, "set")) {
        // The firmware answers every failure with the same generic error, so
        // a full table cannot be told apart from the response. For a new
        // combo, re-read the list: if it is now full, say so instead.
        if (isNew) {
          const fresh = await callWithTimeout("getAllCombos", Combos.encodeGetAllCombos()).catch(() => null);
          const list = fresh?.getAllCombos?.combos;
          if (list && list.length >= Combos.MAX_COMBOS) {
            setCombos(list);
            setSaveError(`コンボは最大${Combos.MAX_COMBOS}件です。追加するには、既存のコンボを削除してください。`);
            toast("コンボの保存に失敗しました", "error");
            return;
          }
        }
        setSaveError("コンボの保存に失敗しました。入力はそのまま残っています。もう一度保存してください。");
        toast("コンボの保存に失敗しました", "error");
        return;
      }
      const reloadResp = await callWithTimeout("getAllCombos", Combos.encodeGetAllCombos());
      if (reloadResp.getAllCombos) {
        setCombos(reloadResp.getAllCombos.combos);
      }
      closeEditor();
      toast("コンボを保存しました", "success");
    } catch (e) {
      console.error("[Combos] Save failed:", e);
      setSaveError("コンボの保存に失敗しました。入力はそのまま残っています。もう一度保存してください。");
      toast("コンボの保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }, [editing, editingIsNew, saveBlockReason, combos, callWithTimeout, toast, closeEditor]);

  const handleDelete = useCallback(async (comboId: number) => {
    try {
      const resp = await callWithTimeout("deleteCombo", Combos.encodeDeleteCombo(comboId));
      if (!Combos.isWriteSuccess(resp, "delete")) {
        toast("コンボの削除に失敗しました", "error");
        return;
      }
      setCombos((prev) => prev.filter((c) => c.comboId !== comboId));
      toast("コンボを削除しました", "success");
    } catch (e) {
      console.error("[Combos] Delete failed:", e);
      toast("コンボの削除に失敗しました", "error");
    }
  }, [callWithTimeout, toast]);

  const handleKeyPositionToggle = useCallback((position: number) => {
    setEditing((prev) => {
      if (!prev) return prev;
      if (prev.keyPositions.includes(position)) {
        return { ...prev, keyPositions: prev.keyPositions.filter((p) => p !== position) };
      }
      if (prev.keyPositions.length >= Combos.MAX_KEYS_PER_COMBO) return prev;
      return { ...prev, keyPositions: [...prev.keyPositions, position] };
    });
  }, []);

  // Keep an open editor on screen when the link drops, so nothing typed is
  // lost; saving is disabled until the keyboard is back.
  if (screen === "unavailable" && !editing) {
    return (
      <SubsystemUnavailable
        featureName="コンボキー設定"
        explanation="キーボードのファームウェアがこの機能に対応していないか、接続方法を確認してください。"
        technicalDetails="CONFIG_ZMK_RUNTIME_COMBOS=y, CONFIG_ZMK_RUNTIME_COMBOS_STUDIO_RPC=y"
      />
    );
  }

  if (screen === "loading" && !editing) {
    return (
      <div className="p-4">
        <p className="text-base-content/50 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (screen === "read-error" && !editing) {
    return (
      <CenteredNotice
        title="コンボの一覧を読めませんでした"
        body="もう一度読んでください。何度やっても読めないときは、キーボードの電源を入れ直してから、もう一度つないでください。"
      >
        <Button
          className={`flex min-h-11 items-center gap-1 rounded bg-primary text-primary-content px-4 py-2 text-sm hover:opacity-90 ${FOCUS_RING}`}
          onPress={() => setReloadToken((t) => t + 1)}
        >
          もう一度読む
        </Button>
      </CenteredNotice>
    );
  }

  if (screen === "needs-update") {
    return (
      <CenteredNotice
        title="更新するとコンボが使えます"
        body="このキーボードのファームウェアは、コンボに対応する前の版です。ファームウェアを更新すると、コンボを設定できるようになります。"
      >
        <Button
          className={`flex min-h-11 items-center gap-1 rounded bg-primary text-primary-content px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50 ${FOCUS_RING}`}
          onPress={onRequestFirmwareUpdate}
          isDisabled={!onRequestFirmwareUpdate}
        >
          ファームウェアを更新する
        </Button>
        {!onRequestFirmwareUpdate && (
          <p className="text-sm text-base-content/50">この画面からは更新できません。配布版のアプリから更新してください。</p>
        )}
      </CenteredNotice>
    );
  }

  if (screen === "engine-disabled") {
    return (
      <CenteredNotice
        title="このファームではコンボを止めています"
        body="このファームウェアでは、コンボの機能が止められています。"
      />
    );
  }

  if (editing) {
    return (
      <ComboEditor
        editing={editing}
        setEditing={setEditing}
        isNew={editingIsNew}
        allLayers={allLayers}
        setAllLayers={setAllLayers}
        behaviors={behaviors}
        layers={layers}
        keyLabels={keyLabels}
        keyCount={keyCount}
        saving={saving}
        saveError={saveError}
        saveBlockReason={saveBlockReason}
        onToggleKey={handleKeyPositionToggle}
        onSave={handleSave}
        onCancel={handleCancel}
        confirmDiscard={confirmDiscard}
        onConfirmDiscard={closeEditor}
        onKeepEditing={() => setConfirmDiscard(false)}
      />
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">コンボキー設定</h2>
          <p className="text-sm text-base-content/60">
            2〜4個のキーを一緒に押すと、別の動作を実行できます。
          </p>
          <p className="text-sm text-base-content/50">例: J と K を同時に押す → Esc</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-base-content/60" aria-label={`登録 ${combos.length} 件、上限 ${Combos.MAX_COMBOS} 件`}>
              {combos.length} / {Combos.MAX_COMBOS}件
            </span>
            <Button
              className={`flex min-h-11 items-center gap-1 rounded bg-primary text-primary-content px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50 ${FOCUS_RING}`}
              onPress={handleNew}
              isDisabled={atLimit}
            >
              <Plus className="w-4 h-4" />
              コンボを追加
            </Button>
          </div>
          {atLimit && (
            <p className="text-sm text-base-content/60 max-w-xs text-right">
              コンボは最大{Combos.MAX_COMBOS}件です。追加するには、既存のコンボを削除してください。
            </p>
          )}
        </div>
      </div>

      {combos.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="w-14 h-14 rounded-full bg-base-200 flex items-center justify-center">
            <Keyboard className="w-7 h-7 text-base-content/40" />
          </div>
          <p className="text-base font-medium text-base-content/80">まだコンボがありません</p>
          <p className="text-sm text-base-content/50">
            JとKを一緒に押してEscにする、などの操作を追加できます。
          </p>
          <Button
            className={`flex min-h-11 items-center gap-1 rounded bg-primary text-primary-content px-4 py-2 text-sm hover:opacity-90 ${FOCUS_RING}`}
            onPress={handleNew}
          >
            最初のコンボを作る
          </Button>
        </div>
      )}

      {combos.map((combo) => (
        <ComboCard
          key={combo.comboId}
          combo={combo}
          behaviors={behaviors}
          layers={layers}
          keyLabels={keyLabels}
          onEdit={() => handleEdit(combo)}
          onDelete={() => setPendingDeleteId(combo.comboId)}
        />
      ))}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="コンボを削除"
        destructive
        confirmLabel="削除する"
        onConfirm={() => {
          const id = pendingDeleteId;
          setPendingDeleteId(null);
          if (id !== null) handleDelete(id);
        }}
        onCancel={() => setPendingDeleteId(null)}
      >
        <p>このコンボを削除します。この操作は元に戻せません。続けますか？</p>
      </ConfirmDialog>
    </div>
  );
}

function CenteredNotice({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-8">
      <div className="w-16 h-16 rounded-full bg-base-200 flex items-center justify-center">
        <Keyboard className="w-8 h-8 text-base-content/30" />
      </div>
      <div className="text-center max-w-md">
        <h3 className="text-lg font-medium text-base-content/80 mb-2">{title}</h3>
        <p className="text-sm text-base-content/50">{body}</p>
      </div>
      {children}
    </div>
  );
}

const KEY_PX = 48; // one key unit on screen; keeps every tap target >= 44px

function KeyDiagram({
  keyCount,
  keyLabels,
  selected,
  onToggle,
}: {
  keyCount: number;
  keyLabels: string[];
  selected: number[];
  onToggle: (position: number) => void;
}) {
  const full = selected.length >= Combos.MAX_KEYS_PER_COMBO;
  const renderKey = (i: number, style?: React.CSSProperties) => {
    const label = getKeyLabel(i, keyLabels);
    const isSelected = selected.includes(i);
    const isDisabled = full && !isSelected;
    return (
      <button
        key={i}
        type="button"
        style={style}
        disabled={isDisabled}
        aria-pressed={isSelected}
        aria-label={`${label}${isSelected ? "（選択中）" : ""}`}
        className={`h-11 min-w-11 px-1 text-xs rounded border transition-colors truncate ${FOCUS_RING} ${
          isSelected
            ? "bg-primary text-primary-content border-primary font-bold"
            : isDisabled
              ? "bg-base-100 border-base-300 opacity-40 cursor-not-allowed"
              : "bg-base-100 border-base-300 hover:border-primary/40"
        }`}
        onClick={() => onToggle(i)}
        title={label}
      >
        {label}
      </button>
    );
  };

  // The split diagram mirrors the hardware so a key on screen sits where it
  // sits on the keyboard. Any other key count falls back to a plain grid.
  if (keyCount === MINIMAL_KEYS_KEY_COUNT) {
    const width = Math.max(...MINIMAL_KEYS_POSITIONS.map((k) => k.x + k.width)) / 100 * KEY_PX;
    const height = Math.max(...MINIMAL_KEYS_POSITIONS.map((k) => k.y + k.height)) / 100 * KEY_PX;
    return (
      <div className="overflow-x-auto">
        <div className="relative" style={{ width, height }}>
          {MINIMAL_KEYS_POSITIONS.map((k, i) =>
            renderKey(i, {
              position: "absolute",
              left: (k.x / 100) * KEY_PX + 2,
              top: (k.y / 100) * KEY_PX + 2,
              width: (k.width / 100) * KEY_PX - 4,
              height: (k.height / 100) * KEY_PX - 4,
            })
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-11 gap-1 min-w-[560px]">
        {Array.from({ length: keyCount }, (_, i) => renderKey(i))}
      </div>
    </div>
  );
}

function MsSlider({
  id,
  label,
  description,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  description: string;
  value: number;
  onChange: (ms: number) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <p className="text-sm text-base-content/50">{description}</p>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={Combos.MIN_MS}
          max={Combos.MAX_MS}
          step={10}
          value={value}
          onChange={(e) => onChange(Combos.clampMs(Number(e.target.value)))}
          className="flex-1 min-h-11 accent-primary"
        />
        <input
          type="number"
          aria-label={`${label}（ミリ秒）`}
          min={Combos.MIN_MS}
          max={Combos.MAX_MS}
          step={10}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && e.target.value !== "") onChange(n);
          }}
          onBlur={() => onChange(Combos.clampMs(value))}
          className="w-20 min-h-11 px-2 text-sm border rounded"
        />
        <span className="text-sm text-base-content/60 w-36">
          {msWithSeconds(value)}{hint ? ` ${hint}` : ""}
        </span>
      </div>
    </div>
  );
}

function ComboEditor({
  editing,
  setEditing,
  isNew,
  allLayers,
  setAllLayers,
  behaviors,
  layers,
  keyLabels,
  keyCount,
  saving,
  saveError,
  saveBlockReason,
  onToggleKey,
  onSave,
  onCancel,
  confirmDiscard,
  onConfirmDiscard,
  onKeepEditing,
}: {
  editing: Combos.ComboConfig;
  setEditing: React.Dispatch<React.SetStateAction<Combos.ComboConfig | null>>;
  isNew: boolean;
  allLayers: boolean;
  setAllLayers: (all: boolean) => void;
  behaviors: ReturnType<typeof useBehaviorList>;
  layers: LayerDisplay[];
  keyLabels: string[];
  keyCount: number;
  saving: boolean;
  saveError: string | null;
  saveBlockReason: string | null;
  onToggleKey: (position: number) => void;
  onSave: () => void;
  onCancel: () => void;
  confirmDiscard: boolean;
  onConfirmDiscard: () => void;
  onKeepEditing: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(!editing.binding || editing.binding.behaviorId === 0);

  const behavior = editing.binding
    ? behaviors.find((b) => b.id === editing.binding!.behaviorId)
    : undefined;
  const bindingSummary = behavior && editing.binding
    ? `${getBehaviorDescription(behavior.displayName)?.label ?? behavior.displayName}${(() => {
        const d = formatBindingDetail(behavior.displayName, {
          behaviorId: editing.binding.behaviorId,
          param1: editing.binding.param1,
          param2: editing.binding.param2,
        }, layers);
        return d ? ` ${d}` : "";
      })()}`
    : null;

  // A combo read without field 7 shows the firmware default it actually runs with.
  const priorIdleShown = editing.requirePriorIdleMs || Combos.DEFAULT_PRIOR_IDLE_MS;
  const priorIdleIsDefault = editing.requirePriorIdleMs === 0;
  const selectableLayers = layers.filter((l) => l.index < 32);
  const selectedLayerIndices = Combos.layerIndicesFromMask(editing.layerMask);

  const update = (patch: Partial<Combos.ComboConfig>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <div className="p-4 flex flex-col gap-5 overflow-y-auto max-h-full">
      <div className="flex items-center gap-3">
        <Button
          className={`flex min-h-11 items-center gap-1 rounded px-2 text-sm text-base-content/70 hover:bg-base-200 ${FOCUS_RING}`}
          onPress={onCancel}
        >
          <ArrowLeft className="w-4 h-4" />
          コンボ一覧
        </Button>
        <h2 className="text-lg font-semibold">{isNew ? "新しいコンボ" : "コンボを編集"}</h2>
      </div>

      {saveError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded border border-error/40 bg-error/5 px-3 py-2">
          <p className="text-sm text-error">{saveError}</p>
          <Button
            className={`min-h-11 rounded px-3 text-sm text-error hover:bg-error/10 ${FOCUS_RING}`}
            onPress={onSave}
            isDisabled={saving || !!saveBlockReason}
          >
            再試行
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">1. 同時に押すキー</h3>
          <span className="text-sm text-base-content/60" aria-live="polite">
            選択中 {editing.keyPositions.length} / {Combos.MAX_KEYS_PER_COMBO}
          </span>
        </div>
        <KeyDiagram
          keyCount={keyCount}
          keyLabels={keyLabels}
          selected={editing.keyPositions}
          onToggle={onToggleKey}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-base-content/60">選択中:</span>
          {editing.keyPositions.length === 0 && <span className="text-base-content/40">なし</span>}
          {editing.keyPositions.map((p) => (
            <button
              key={p}
              type="button"
              aria-label={`${getKeyLabel(p, keyLabels)} を外す`}
              className={`flex min-h-11 items-center gap-1 rounded bg-base-200 px-2 ${FOCUS_RING}`}
              onClick={() => onToggleKey(p)}
            >
              {getKeyLabel(p, keyLabels)}
              <X className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">2. 実行する動作</h3>
        {!pickerOpen && (
          <div className="flex items-center justify-between rounded border border-base-300 px-3 py-2">
            <span className="text-sm font-medium">{bindingSummary ?? "未選択"}</span>
            <Button
              className={`min-h-11 rounded px-3 text-sm text-primary hover:bg-primary/10 ${FOCUS_RING}`}
              onPress={() => setPickerOpen(true)}
            >
              変更する
            </Button>
          </div>
        )}
        {pickerOpen && (
          behaviors.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-base-content/60">
                {bindingSummary ? `選択中: ${bindingSummary}` : "動作を選ぶ"}
              </p>
              <BehaviorBindingPicker
                binding={editing.binding
                  ? { behaviorId: editing.binding.behaviorId, param1: editing.binding.param1, param2: editing.binding.param2 }
                  : { behaviorId: 0, param1: 0, param2: 0 }}
                behaviors={behaviors}
                layers={layers}
                onBindingChanged={(b: BehaviorBinding) =>
                  update({ binding: { behaviorId: b.behaviorId, param1: b.param1 ?? 0, param2: b.param2 ?? 0 } })
                }
              />
            </div>
          ) : (
            <p className="text-base-content/50 text-sm">動作の一覧を読み込み中...</p>
          )
        )}
      </section>

      <section className="flex flex-col gap-3">
        <Button
          aria-expanded={detailsOpen}
          className={`flex min-h-11 items-center gap-1 self-start rounded px-2 text-sm font-medium hover:bg-base-200 ${FOCUS_RING}`}
          onPress={() => setDetailsOpen((o) => !o)}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${detailsOpen ? "" : "-rotate-90"}`} />
          詳細設定
        </Button>
        {detailsOpen && (
          <div className="flex flex-col gap-4 p-3 rounded-lg bg-base-200/30 border border-base-300/30">
            <MsSlider
              id="combo-timeout"
              label="同時押しの受付時間"
              description="最初のキーを押してから、残りのキーを押すまでの時間です。"
              value={editing.timeoutMs}
              onChange={(ms) => update({ timeoutMs: ms })}
              hint={timeoutHint(editing.timeoutMs)}
            />
            <div className="flex flex-col gap-1">
              <MsSlider
                id="combo-prior-idle"
                label="打った直後に待つ時間"
                description="ほかのキーを打ってから、この時間が過ぎるまではコンボを発動しません。速く打っている途中の誤発動を減らします。"
                value={priorIdleShown}
                onChange={(ms) => update({ requirePriorIdleMs: ms })}
              />
              {priorIdleIsDefault && (
                <span className="text-sm text-base-content/50">
                  {`${(Combos.DEFAULT_PRIOR_IDLE_MS / 1000).toFixed(1)}秒（既定）`}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">有効にするレイヤー</span>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allLayers}
                  onChange={(e) => {
                    setAllLayers(e.target.checked);
                    update({ layerMask: 0 });
                  }}
                />
                すべてのレイヤー
              </label>
              {!allLayers && (
                <div className="flex flex-wrap gap-x-4 pl-6">
                  {selectableLayers.map((l) => (
                    <label key={l.index} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedLayerIndices.includes(l.index)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...selectedLayerIndices, l.index]
                            : selectedLayerIndices.filter((i) => i !== l.index);
                          update({ layerMask: Combos.layerMaskFromIndices(next) });
                        }}
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Switch
              isSelected={editing.slowRelease}
              onChange={(v) => update({ slowRelease: v })}
              label="すべてのキーを離したときに動作を終了"
              description="オフでは、どれか1つを離した時点で終了します。"
            />
          </div>
        )}
      </section>

      <div className="flex flex-col items-end gap-2 pt-2">
        {saveBlockReason && <p className="text-sm text-base-content/60">{saveBlockReason}</p>}
        <div className="flex gap-2">
          <Button
            className={`min-h-11 rounded bg-base-300 px-4 py-2 hover:bg-base-200 ${FOCUS_RING}`}
            onPress={onCancel}
          >
            キャンセル
          </Button>
          <Button
            className={`min-h-11 rounded bg-primary text-primary-content px-4 py-2 hover:opacity-90 disabled:opacity-50 ${FOCUS_RING}`}
            isDisabled={saving || !!saveBlockReason}
            onPress={onSave}
          >
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="変更を破棄"
        destructive
        confirmLabel="破棄する"
        cancelLabel="編集を続ける"
        onConfirm={onConfirmDiscard}
        onCancel={onKeepEditing}
      >
        <p>保存していない変更があります。破棄して一覧に戻りますか？</p>
      </ConfirmDialog>
    </div>
  );
}

function ComboCard({
  combo,
  behaviors,
  layers,
  keyLabels,
  onEdit,
  onDelete,
}: {
  combo: Combos.ComboConfig;
  behaviors: ReturnType<typeof useBehaviorList>;
  layers: LayerDisplay[];
  keyLabels: string[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const behavior = combo.binding
    ? behaviors.find((b) => b.id === combo.binding!.behaviorId)
    : null;
  const desc = behavior ? getBehaviorDescription(behavior.displayName) : null;
  const detail = behavior && combo.binding
    ? formatBindingDetail(behavior.displayName, {
        behaviorId: combo.binding.behaviorId,
        param1: combo.binding.param1,
        param2: combo.binding.param2,
      }, layers)
    : "";

  const keysDisplay = combo.keyPositions
    .map((p) => getKeyLabel(p, keyLabels))
    .join(" + ");
  const layerText = combo.layerMask === 0
    ? "すべてのレイヤー"
    : Combos.layerIndicesFromMask(combo.layerMask)
        .map((i) => layers.find((l) => l.index === i)?.name ?? `レイヤー${i}`)
        .join("・");
  const actionText = `${desc?.label ?? "未設定"}${detail ? ` ${detail}` : ""}`;

  return (
    <div className="flex flex-col gap-1 px-3 py-2 rounded-lg border bg-base-100">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-mono bg-base-200 px-2 py-1 rounded">{keysDisplay}</span>
          <span className="text-base-content/50" aria-hidden>→</span>
          <span className="text-sm font-medium truncate">{actionText}</span>
        </div>
        <span className="text-sm text-base-content/60 shrink-0">{layerText}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-base-content/50">
          同時押し {combo.timeoutMs}ms
          {combo.slowRelease && "・すべて離したとき終了"}
        </span>
        <div className="flex gap-1">
          <Button
            aria-label={`${keysDisplay} → ${actionText} を編集`}
            className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded px-2 text-sm text-base-content/70 hover:bg-base-200 ${FOCUS_RING}`}
            onPress={onEdit}
          >
            <Pencil className="w-3.5 h-3.5" />
            編集
          </Button>
          <Tooltip label="削除">
            <Button
              aria-label={`${keysDisplay} → ${actionText} を削除`}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded text-error/70 hover:bg-error/10 hover:text-error ${FOCUS_RING}`}
              onPress={onDelete}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
