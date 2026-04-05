import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { useCustomSubsystem } from "../rpc/useCustomSubsystem";
import { useToast } from "../misc/Toast";
import { SubsystemUnavailable } from "../misc/SubsystemUnavailable";
import { SettingsCard } from "../misc/SettingsCard";
import { LoadingSkeleton } from "../misc/LoadingSkeleton";
import * as HT from "../proto/holdtap";

// -1 as uint32 in protobuf = "not configured in device tree" = effectively 0ms
const SENTINEL = 0xFFFFFFFF;
function sanitizeMs(v: number): number {
  return v >= SENTINEL ? 0 : v;
}

function tappingTermDescription(ms: number): string {
  if (ms <= 120) return "とても速い - 上級者向け";
  if (ms <= 180) return "速い - 慣れた人向け";
  if (ms <= 250) return "標準 - おすすめ";
  if (ms <= 350) return "ゆっくり - 初心者向け";
  return "とてもゆっくり";
}

function msDescription(ms: number): string {
  if (ms === 0) return "無効";
  if (ms <= 100) return "短い";
  if (ms <= 200) return "標準";
  return "長い";
}

export function HoldTapSettings() {
  const subsystem = useCustomSubsystem(HT.SUBSYSTEM_ID);
  const { toast } = useToast();
  const [holdTaps, setHoldTaps] = useState<HT.HoldTapInfo[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Local form state
  const [tappingTerm, setTappingTerm] = useState(200);
  const [quickTap, setQuickTap] = useState(0);
  const [requirePriorIdle, setRequirePriorIdle] = useState(0);
  const [flavor, setFlavor] = useState<HT.HoldTapFlavor>(0);

  const discoveryVersionRef = useRef(0);

  const callWithTimeout = useCallback(
    async (label: string, payload: Uint8Array, timeoutMs = 5000) => {
      if (!subsystem) throw new Error("No subsystem");
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`RPC timeout: ${label}`)),
          timeoutMs
        )
      );
      const data = await Promise.race([
        subsystem.callRPC(payload),
        timeout,
      ]);
      return HT.decodeResponse(data);
    },
    [subsystem]
  );

  // Discover hold-tap instances
  useEffect(() => {
    if (!subsystem) {
      setHoldTaps([]);
      setSelectedId(null);
      return;
    }

    const version = ++discoveryVersionRef.current;

    async function discover() {
      setLoading(true);
      try {
        const resp = await callWithTimeout(
          "listHoldTaps",
          HT.encodeListHoldTaps(),
          15000
        );
        if (version !== discoveryVersionRef.current) return;

        const list = resp.listHoldTaps?.holdTaps ?? [];
        setHoldTaps(list);

        if (list.length > 0) {
          setSelectedId(list[0].id);
          applyInfo(list[0]);
        }
      } catch (e) {
        if (version === discoveryVersionRef.current) {
          console.error("[HoldTap] Discovery failed:", e);
          toast("Failed to discover hold-tap settings", "error");
        }
      } finally {
        if (version === discoveryVersionRef.current) setLoading(false);
      }
    }

    discover();
  }, [subsystem, callWithTimeout, toast]);

  function applyInfo(info: HT.HoldTapInfo) {
    setTappingTerm(info.tappingTermMs);
    setQuickTap(sanitizeMs(info.quickTapMs));
    setRequirePriorIdle(sanitizeMs(info.requirePriorIdleMs));
    setFlavor(info.flavor);
  }

  const selected = holdTaps.find((h) => h.id === selectedId) ?? null;

  const handleApply = useCallback(async () => {
    if (!subsystem || selectedId === null || !selected) return;
    setSaving(true);
    try {
      const id = selectedId;
      if (tappingTerm !== selected.tappingTermMs) {
        await callWithTimeout(
          "setTappingTerm",
          HT.encodeSetTappingTerm(id, tappingTerm)
        );
      }
      if (quickTap !== sanitizeMs(selected.quickTapMs)) {
        await callWithTimeout(
          "setQuickTap",
          HT.encodeSetQuickTap(id, quickTap)
        );
      }
      if (requirePriorIdle !== sanitizeMs(selected.requirePriorIdleMs)) {
        await callWithTimeout(
          "setRequirePriorIdle",
          HT.encodeSetRequirePriorIdle(id, requirePriorIdle)
        );
      }
      if (flavor !== selected.flavor) {
        await callWithTimeout(
          "setFlavor",
          HT.encodeSetFlavor(id, flavor)
        );
      }

      const resp = await callWithTimeout(
        "listHoldTaps",
        HT.encodeListHoldTaps()
      );
      if (resp.listHoldTaps?.holdTaps) {
        setHoldTaps(resp.listHoldTaps.holdTaps);
        const updated = resp.listHoldTaps.holdTaps.find(
          (h) => h.id === id
        );
        if (updated) applyInfo(updated);
      }
    } catch (e) {
      console.error("[HoldTap] Failed to save:", e);
      toast("Failed to save hold-tap settings", "error");
    } finally {
      setSaving(false);
    }
  }, [
    subsystem,
    selectedId,
    selected,
    tappingTerm,
    quickTap,
    requirePriorIdle,
    flavor,
    callWithTimeout,
    toast,
  ]);

  const handleReset = useCallback(async () => {
    if (!subsystem || selectedId === null) return;
    setSaving(true);
    try {
      await callWithTimeout(
        "resetHoldTap",
        HT.encodeResetHoldTap(selectedId)
      );
      // Reload to confirm
      const resp = await callWithTimeout(
        "listHoldTaps",
        HT.encodeListHoldTaps()
      );
      if (resp.listHoldTaps?.holdTaps) {
        setHoldTaps(resp.listHoldTaps.holdTaps);
        const updated = resp.listHoldTaps.holdTaps.find(
          (h) => h.id === selectedId
        );
        if (updated) applyInfo(updated);
      }
    } catch (e) {
      console.error("[HoldTap] Failed to reset:", e);
      toast("Failed to reset hold-tap settings", "error");
    } finally {
      setSaving(false);
    }
  }, [subsystem, selectedId, callWithTimeout, toast]);

  if (!subsystem) {
    return (
      <SubsystemUnavailable
        featureName="長押し設定"
        explanation="キーボードのファームウェアがこの機能に対応していないか、接続方法を確認してください。"
        technicalDetails="CONFIG_ZMK_RUNTIME_HOLD_TAP=y, CONFIG_ZMK_RUNTIME_HOLD_TAP_STUDIO_RPC=y"
      />
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <h2 className="text-lg font-semibold">
        長押し設定
        {selected && (
          <span className="text-sm font-normal text-base-content/60 ml-2">
            ({selected.name})
          </span>
        )}
      </h2>

      {/* Instance selector */}
      {holdTaps.length > 1 && (
        <section className="flex gap-2 flex-wrap">
          {holdTaps.map((ht) => (
            <Button
              key={ht.id}
              className={`rounded-md px-3 py-1.5 text-sm transition-all ${
                selectedId === ht.id
                  ? "bg-primary text-primary-content"
                  : "bg-base-200 hover:bg-base-300"
              }`}
              onPress={() => {
                setSelectedId(ht.id);
                applyInfo(ht);
              }}
            >
              {ht.name}
            </Button>
          ))}
        </section>
      )}

      {holdTaps.length === 0 && !loading && (
        <p className="text-base-content/50 text-sm">
          長押し設定の対象が見つかりません。
        </p>
      )}

      {loading && <LoadingSkeleton lines={4} />}

      {selected && !loading && (
        <>
          <SettingsCard
            title="タッピングターム"
            description="キーを押してから「長押し」と判定されるまでの時間"
            defaultNote={`初期値: ${selected.defaultTappingTermMs}ms`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xs text-base-content/50 w-10">速い</span>
              <input
                type="range"
                min={50}
                max={500}
                step={10}
                value={tappingTerm}
                onChange={(e) => setTappingTerm(parseInt(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-base-content/50 w-10 text-right">遅い</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-base-content/40">
                {tappingTermDescription(tappingTerm)}
              </span>
              <span className="text-sm font-medium tabular-nums">{tappingTerm}ms</span>
            </div>
          </SettingsCard>

          <SettingsCard
            title="クイックタップ"
            description="素早く連打した時にタップとして扱う時間"
            defaultNote={`初期値: ${sanitizeMs(selected.defaultQuickTapMs)}ms`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xs text-base-content/50 w-10">無効</span>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={quickTap}
                onChange={(e) => setQuickTap(parseInt(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-base-content/50 w-10 text-right">長い</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-base-content/40">
                {msDescription(quickTap)}
              </span>
              <span className="text-sm font-medium tabular-nums">{quickTap}ms</span>
            </div>
          </SettingsCard>

          <SettingsCard
            title="入力前待ち時間"
            description="前のキーを離してからこの時間経過しないと長押し判定しない"
            defaultNote={`初期値: ${sanitizeMs(selected.defaultRequirePriorIdleMs)}ms`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xs text-base-content/50 w-10">無効</span>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={requirePriorIdle}
                onChange={(e) => setRequirePriorIdle(parseInt(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-base-content/50 w-10 text-right">長い</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-base-content/40">
                {msDescription(requirePriorIdle)}
              </span>
              <span className="text-sm font-medium tabular-nums">{requirePriorIdle}ms</span>
            </div>
          </SettingsCard>

          <SettingsCard
            title="判定モード"
            description="タップと長押しをどう判定するか"
            defaultNote={`初期値: ${HT.FLAVOR_LABELS[selected.defaultFlavor] ?? "不明"}`}
          >
            <select
              value={flavor}
              onChange={(e) =>
                setFlavor(parseInt(e.target.value) as HT.HoldTapFlavor)
              }
              className="w-full rounded-md px-2 py-1.5 bg-base-100 border border-base-300"
            >
              {Object.entries(HT.FLAVOR_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </SettingsCard>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              className="rounded-md bg-primary text-primary-content px-4 py-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
              isDisabled={saving}
              onPress={handleApply}
            >
              {saving ? "適用中..." : "適用"}
            </Button>
            <Button
              className="rounded-md bg-base-200 px-4 py-2 hover:bg-base-300 transition-colors"
              onPress={handleReset}
            >
              初期値に戻す
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
