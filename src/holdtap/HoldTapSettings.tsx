import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { useCustomSubsystem } from "../rpc/useCustomSubsystem";
import * as HT from "../proto/holdtap";

// -1 as uint32 in protobuf = "not configured in device tree" = effectively 0ms
const SENTINEL = 0xFFFFFFFF;
function sanitizeMs(v: number): number {
  return v >= SENTINEL ? 0 : v;
}

export function HoldTapSettings() {
  const subsystem = useCustomSubsystem(HT.SUBSYSTEM_ID);
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
        }
      } finally {
        if (version === discoveryVersionRef.current) setLoading(false);
      }
    }

    discover();
  }, [subsystem, callWithTimeout]);

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
    } finally {
      setSaving(false);
    }
  }, [subsystem, selectedId, callWithTimeout]);

  if (!subsystem) {
    return (
      <div className="p-4 text-base-content/60">
        <p>Hold-tap runtime configuration module is not available.</p>
        <p className="text-sm mt-2">
          Firmware needs{" "}
          <code>CONFIG_ZMK_RUNTIME_HOLD_TAP=y</code> and{" "}
          <code>CONFIG_ZMK_RUNTIME_HOLD_TAP_STUDIO_RPC=y</code>
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <h2 className="text-lg font-semibold">
        Hold-Tap Settings{" "}
        {selected && (
          <span className="text-sm font-normal text-base-content/60">
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
              className={`rounded px-3 py-1 text-sm ${
                selectedId === ht.id
                  ? "bg-primary text-primary-content"
                  : "bg-base-300 hover:bg-base-200"
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
          No hold-tap instances found.
        </p>
      )}

      {loading && (
        <p className="text-base-content/50 text-sm">
          Discovering hold-tap instances...
        </p>
      )}

      {selected && !loading && (
        <>
          {/* Tapping Term */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-base-content/70">
              Tapping Term
              <span className="text-xs font-normal text-base-content/40 ml-2">
                (default: {selected.defaultTappingTermMs}ms)
              </span>
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-base-content/50 w-10">
                50ms
              </span>
              <input
                type="range"
                min={50}
                max={500}
                step={10}
                value={tappingTerm}
                onChange={(e) =>
                  setTappingTerm(parseInt(e.target.value))
                }
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-base-content/50 w-12">
                500ms
              </span>
            </div>
            <p className="text-sm font-medium text-center">
              {tappingTerm}ms
            </p>
          </section>

          {/* Quick Tap */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-base-content/70">
              Quick Tap
              <span className="text-xs font-normal text-base-content/40 ml-2">
                (default: {sanitizeMs(selected.defaultQuickTapMs)}ms)
              </span>
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-base-content/50 w-10">
                0ms
              </span>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={quickTap}
                onChange={(e) =>
                  setQuickTap(parseInt(e.target.value))
                }
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-base-content/50 w-12">
                500ms
              </span>
            </div>
            <p className="text-sm font-medium text-center">
              {quickTap}ms
            </p>
          </section>

          {/* Require Prior Idle */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-base-content/70">
              Require Prior Idle
              <span className="text-xs font-normal text-base-content/40 ml-2">
                (default: {sanitizeMs(selected.defaultRequirePriorIdleMs)}ms)
              </span>
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-base-content/50 w-10">
                0ms
              </span>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={requirePriorIdle}
                onChange={(e) =>
                  setRequirePriorIdle(parseInt(e.target.value))
                }
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-base-content/50 w-12">
                500ms
              </span>
            </div>
            <p className="text-sm font-medium text-center">
              {requirePriorIdle}ms
            </p>
          </section>

          {/* Flavor */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-base-content/70">
              Flavor
              <span className="text-xs font-normal text-base-content/40 ml-2">
                (default:{" "}
                {HT.FLAVOR_LABELS[selected.defaultFlavor] ??
                  "Unknown"})
              </span>
            </h3>
            <select
              value={flavor}
              onChange={(e) =>
                setFlavor(
                  parseInt(e.target.value) as HT.HoldTapFlavor
                )
              }
              className="rounded px-2 py-1 bg-base-100 border border-base-300"
            >
              {Object.entries(HT.FLAVOR_LABELS).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                )
              )}
            </select>
          </section>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              className="rounded bg-primary text-primary-content px-4 py-2 hover:opacity-90 disabled:opacity-50"
              isDisabled={saving}
              onPress={handleApply}
            >
              {saving ? "Applying..." : "Apply"}
            </Button>
            <Button
              className="rounded bg-base-300 px-4 py-2 hover:bg-base-200"
              onPress={handleReset}
            >
              Reset to Default
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
