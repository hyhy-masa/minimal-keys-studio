import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { Plus, Trash2, X } from "lucide-react";
import { SubsystemUnavailable } from "../misc/SubsystemUnavailable";
import { useCustomSubsystem } from "../rpc/useCustomSubsystem";
import { useToast } from "../misc/Toast";
import * as Combos from "../proto/combos";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { useBehaviorList } from "../behaviors/BehaviorsContext";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { formatBindingDetail } from "../behaviors/binding-display";
import { getBehaviorDescription } from "../behaviors/behavior-descriptions";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { call_rpc } from "../rpc/logging";

interface LayerDisplay {
  id: number;
  index: number;
  name: string;
}

function useLayers(): LayerDisplay[] {
  const connection = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const [layers, setLayers] = useState<LayerDisplay[]>([]);

  useEffect(() => {
    if (!connection.conn || lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) {
      setLayers([]);
      return;
    }
    let ignore = false;
    async function load() {
      if (!connection.conn) return;
      const resp = await call_rpc(connection.conn, { keymap: { getKeymap: true } });
      if (ignore) return;
      const km = resp?.keymap?.getKeymap;
      if (km?.layers) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setLayers(km.layers.map((l: any, i: number) => ({ id: l.id ?? i, index: i, name: l.name || `Layer ${i}` })));
      }
    }
    load();
    return () => { ignore = true; };
  }, [connection, lockState]);

  return layers;
}

export function ComboSettings() {
  const subsystem = useCustomSubsystem(Combos.SUBSYSTEM_ID);
  const { toast } = useToast();
  const behaviors = useBehaviorList();
  const layers = useLayers();

  const [combos, setCombos] = useState<Combos.ComboConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Combos.ComboConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const nextIdRef = useRef(1);

  const callWithTimeout = useCallback(
    async (label: string, payload: Uint8Array, timeoutMs = 5000) => {
      if (!subsystem) throw new Error("No subsystem");
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`RPC timeout: ${label}`)), timeoutMs)
      );
      const data = await Promise.race([subsystem.callRPC(payload), timeout]);
      return Combos.decodeResponse(data);
    },
    [subsystem]
  );

  const discoveryVersionRef = useRef(0);

  useEffect(() => {
    if (!subsystem) {
      setCombos([]);
      return;
    }
    const version = ++discoveryVersionRef.current;

    async function load() {
      setLoading(true);
      try {
        const resp = await callWithTimeout("getAllCombos", Combos.encodeGetAllCombos(), 15000);
        if (version !== discoveryVersionRef.current) return;
        const list = resp.getAllCombos?.combos ?? [];
        setCombos(list);
        if (list.length > 0) {
          nextIdRef.current = Math.max(...list.map((c) => c.comboId)) + 1;
        }
      } catch (e) {
        if (version === discoveryVersionRef.current) {
          console.error("[Combos] Failed to load:", e);
          toast("コンボの読み込みに失敗しました", "error");
        }
      } finally {
        if (version === discoveryVersionRef.current) setLoading(false);
      }
    }
    load();
  }, [subsystem, callWithTimeout, toast]);

  const handleNew = useCallback(() => {
    setEditing({
      comboId: nextIdRef.current++,
      keyPositions: [],
      timeoutMs: 50,
      binding: null,
      layerMask: 0,
      slowRelease: false,
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing || editing.keyPositions.length < 2) {
      toast("2つ以上のキーを選択してください", "error");
      return;
    }
    if (!editing.binding || editing.binding.behaviorId === 0) {
      toast("割り当てる動作を選択してください", "error");
      return;
    }

    setSaving(true);
    try {
      const resp = await callWithTimeout("setCombo", Combos.encodeSetCombo(editing));
      if (resp.error) {
        toast("コンボの保存に失敗しました", "error");
        return;
      }
      const reloadResp = await callWithTimeout("getAllCombos", Combos.encodeGetAllCombos());
      if (reloadResp.getAllCombos?.combos) {
        setCombos(reloadResp.getAllCombos.combos);
      }
      setEditing(null);
      toast("コンボを保存しました", "success");
    } catch (e) {
      console.error("[Combos] Save failed:", e);
      toast("コンボの保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }, [editing, callWithTimeout, toast]);

  const handleDelete = useCallback(async (comboId: number) => {
    try {
      const resp = await callWithTimeout("deleteCombo", Combos.encodeDeleteCombo(comboId));
      if (resp.error) {
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

  const handleEdit = useCallback((combo: Combos.ComboConfig) => {
    setEditing({ ...combo });
  }, []);

  const handleKeyPositionToggle = useCallback((position: number) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const positions = prev.keyPositions.includes(position)
        ? prev.keyPositions.filter((p) => p !== position)
        : [...prev.keyPositions, position].slice(0, 4);
      return { ...prev, keyPositions: positions };
    });
  }, []);

  if (!subsystem) {
    return (
      <SubsystemUnavailable
        featureName="コンボキー設定"
        explanation="キーボードのファームウェアがこの機能に対応していないか、接続方法を確認してください。"
        technicalDetails="CONFIG_ZMK_RUNTIME_COMBOS=y, CONFIG_ZMK_RUNTIME_COMBOS_STUDIO_RPC=y"
      />
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">コンボキー設定</h2>
        <Button
          className="flex items-center gap-1 rounded bg-primary text-primary-content px-3 py-1.5 text-sm hover:opacity-90"
          onPress={handleNew}
        >
          <Plus className="w-4 h-4" />
          新規コンボ
        </Button>
      </div>

      {loading && <p className="text-base-content/50 text-sm">読み込み中...</p>}

      {/* Combo list */}
      {!loading && combos.length === 0 && !editing && (
        <p className="text-base-content/50 text-sm">
          コンボキーが設定されていません。「新規コンボ」から追加できます。
        </p>
      )}

      {combos.map((combo) => (
        <ComboCard
          key={combo.comboId}
          combo={combo}
          behaviors={behaviors}
          layers={layers}
          onEdit={() => handleEdit(combo)}
          onDelete={() => handleDelete(combo.comboId)}
        />
      ))}

      {/* Edit form */}
      {editing && (
        <div className="border-2 border-primary/30 rounded-lg p-4 flex flex-col gap-3 bg-primary/5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {combos.some((c) => c.comboId === editing.comboId) ? "コンボを編集" : "新規コンボ"}
            </h3>
            <button
              className="text-base-content/50 hover:text-base-content"
              onClick={() => setEditing(null)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Key positions */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-base-content/70">
              同時押しするキー（2〜4個）
            </label>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 43 }, (_, i) => (
                <button
                  key={i}
                  className={`w-8 h-8 text-sm rounded border transition-all ${
                    editing.keyPositions.includes(i)
                      ? "bg-primary text-primary-content border-primary font-bold"
                      : "bg-white border-base-300 hover:border-primary/30"
                  }`}
                  onClick={() => handleKeyPositionToggle(i)}
                >
                  {i}
                </button>
              ))}
            </div>
            <span className="text-sm text-base-content/50">
              選択中: {editing.keyPositions.length > 0
                ? editing.keyPositions.sort((a, b) => a - b).join(", ")
                : "なし"}
            </span>
          </div>

          {/* Timeout */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-base-content/70">タイムアウト</label>
            <input
              type="number"
              min={10}
              max={500}
              value={editing.timeoutMs}
              onChange={(e) =>
                setEditing((prev) =>
                  prev ? { ...prev, timeoutMs: parseInt(e.target.value) || 50 } : prev
                )
              }
              className="w-20 px-2 py-1 text-sm border rounded"
            />
            <span className="text-sm text-base-content/50">ms</span>
          </div>

          {/* Binding picker */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-base-content/70">割り当てる動作</label>
            {behaviors.length > 0 ? (
              <BehaviorBindingPicker
                binding={editing.binding
                  ? { behaviorId: editing.binding.behaviorId, param1: editing.binding.param1, param2: editing.binding.param2 }
                  : { behaviorId: 0, param1: 0, param2: 0 }}
                behaviors={behaviors}
                layers={layers}
                onBindingChanged={(b: BehaviorBinding) =>
                  setEditing((prev) =>
                    prev ? { ...prev, binding: { behaviorId: b.behaviorId, param1: b.param1 ?? 0, param2: b.param2 ?? 0 } } : prev
                  )
                }
              />
            ) : (
              <p className="text-base-content/50 text-sm">ビヘイビア読み込み中...</p>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2 pt-2">
            <Button
              className="rounded bg-primary text-primary-content px-4 py-2 hover:opacity-90 disabled:opacity-50"
              isDisabled={saving || editing.keyPositions.length < 2}
              onPress={handleSave}
            >
              {saving ? "保存中..." : "保存"}
            </Button>
            <Button
              className="rounded bg-base-300 px-4 py-2 hover:bg-base-200"
              onPress={() => setEditing(null)}
            >
              キャンセル
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ComboCard({
  combo,
  behaviors,
  layers,
  onEdit,
  onDelete,
}: {
  combo: Combos.ComboConfig;
  behaviors: ReturnType<typeof useBehaviorList>;
  layers: LayerDisplay[];
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

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg border bg-white">
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono bg-base-200 px-2 py-1 rounded">
          {combo.keyPositions.join(" + ")}
        </span>
        <span className="text-base-content/50">→</span>
        <span className="text-sm font-medium">
          {desc?.label ?? "未設定"}
          {detail && <span className="text-base-content/60 ml-1">{detail}</span>}
        </span>
        <span className="text-sm text-base-content/40">{combo.timeoutMs}ms</span>
      </div>
      <div className="flex gap-1">
        <button
          className="text-sm px-2 py-1 rounded hover:bg-base-200 text-base-content/60"
          onClick={onEdit}
        >
          編集
        </button>
        <button
          className="text-sm px-2 py-1 rounded hover:bg-error/10 text-error/60 hover:text-error"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
