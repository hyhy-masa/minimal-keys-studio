import { useCallback, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { SubsystemUnavailable } from "../misc/SubsystemUnavailable";
import {
  useCustomSubsystem,
  useCustomNotification,
} from "../rpc/useCustomSubsystem";
import { useToast } from "../misc/Toast";
import * as SETTINGS from "../proto/settings";
import { useTelemetry } from "../telemetry/TelemetryProvider";

export function DeviceSettings() {
  const { toast } = useToast();
  const { isOptedIn, setOptedIn } = useTelemetry();
  const subsystem = useCustomSubsystem(SETTINGS.SUBSYSTEM_ID);
  const [deviceSettings, setDeviceSettings] = useState<
    Map<number, SETTINGS.ActivitySettings>
  >(new Map());
  const [idleSeconds, setIdleSeconds] = useState(30);
  const [sleepMinutes, setSleepMinutes] = useState(15);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const loadedRef = useRef(false);

  // Listen for settings notifications from all devices
  useCustomNotification(subsystem?.subsystemIndex, (payload) => {
    const notif = SETTINGS.decodeNotification(payload);
    if (notif.activitySettings) {
      const s = notif.activitySettings;
      setDeviceSettings((prev) => {
        const next = new Map(prev);
        next.set(s.source, s);
        return next;
      });
      // Use central settings (source=0) for form defaults
      if (s.source === 0) {
        setIdleSeconds(Math.round(s.idleMs / 1000));
        setSleepMinutes(Math.round(s.sleepMs / 60000));
      }
    }
  });

  // Auto-fetch on connect
  const prevSubsystem = useRef(subsystem);
  if (subsystem && !prevSubsystem.current && !loadedRef.current) {
    loadedRef.current = true;
    subsystem
      .callRPC(SETTINGS.encodeGetAllActivitySettings())
      .catch((e: unknown) => {
        console.error("Failed to request all activity settings:", e);
        toast("Failed to load device settings", "error");
      });
  }
  if (!subsystem) loadedRef.current = false;
  prevSubsystem.current = subsystem;

  const allSettings = Array.from(deviceSettings.values()).sort(
    (a, b) => a.source - b.source
  );
  const outOfSync =
    allSettings.length > 1 &&
    allSettings.some(
      (s) =>
        s.idleMs !== allSettings[0].idleMs ||
        s.sleepMs !== allSettings[0].sleepMs
    );

  const handleApply = useCallback(async () => {
    if (!subsystem) return;
    setSaving(true);
    setFeedback(null);
    try {
      await subsystem.callRPC(
        SETTINGS.encodeSetActivitySettings({
          idleMs: idleSeconds * 1000,
          sleepMs: sleepMinutes * 60000,
          source: 0,
        })
      );
      // Reload all settings
      await subsystem.callRPC(SETTINGS.encodeGetAllActivitySettings());
      setFeedback("設定を適用しました");
    } catch (e) {
      console.error("Failed to apply settings:", e);
      toast("Failed to apply device settings", "error");
      setFeedback("設定の適用に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [subsystem, idleSeconds, sleepMinutes, toast]);

  const handleSync = useCallback(async () => {
    if (!subsystem) return;
    setSaving(true);
    setFeedback(null);
    try {
      // Apply current settings to all devices
      for (const s of allSettings) {
        await subsystem.callRPC(
          SETTINGS.encodeSetActivitySettings({
            idleMs: idleSeconds * 1000,
            sleepMs: sleepMinutes * 60000,
            source: s.source,
          })
        );
      }
      await subsystem.callRPC(SETTINGS.encodeGetAllActivitySettings());
      setFeedback("全デバイスに同期しました");
    } catch (e) {
      console.error("Failed to sync settings:", e);
      toast("Failed to sync device settings", "error");
      setFeedback("同期に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [subsystem, idleSeconds, sleepMinutes, allSettings, toast]);

  if (!subsystem) {
    return (
      <SubsystemUnavailable
        featureName="デバイス設定"
        explanation="キーボードのファームウェアがこの機能に対応していないか、接続方法を確認してください。"
        technicalDetails="CONFIG_ZMK_SETTINGS_RPC_STUDIO=y"
      />
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <h2 className="text-lg font-semibold">デバイス設定</h2>

      {/* Sync Warning */}
      {outOfSync && (
        <div className="rounded-lg border border-warning bg-warning/10 p-3 flex items-center justify-between">
          <p className="text-sm text-warning">
            デバイス間で設定が同期されていません。
          </p>
          <Button
            className="rounded bg-warning text-warning-content px-3 py-1 text-sm"
            isDisabled={saving}
            onPress={handleSync}
          >
            全デバイスに同期
          </Button>
        </div>
      )}

      {/* Idle Timeout */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-base-content/70">
          アイドルタイムアウト
        </h3>
        <p className="text-sm text-base-content/50">
          アイドルモード（LED消灯）に移行するまでの時間。0で無効化。
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={5}
            value={idleSeconds}
            onChange={(e) => setIdleSeconds(parseInt(e.target.value) || 0)}
            className="rounded px-2 py-1 bg-base-100 border border-base-300 w-24"
          />
          <span className="text-sm text-base-content/60">秒</span>
        </div>
      </section>

      {/* Sleep Timeout */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-base-content/70">
          スリープタイムアウト
        </h3>
        <p className="text-sm text-base-content/50">
          ディープスリープに移行するまでの時間。0で無効化。
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={1}
            value={sleepMinutes}
            onChange={(e) => setSleepMinutes(parseInt(e.target.value) || 0)}
            className="rounded px-2 py-1 bg-base-100 border border-base-300 w-24"
          />
          <span className="text-sm text-base-content/60">分</span>
        </div>
      </section>

      {/* Per-Device Info */}
      {allSettings.length > 0 && (
        <section className="flex flex-col gap-2 pt-2 border-t border-base-300">
          <h3 className="text-sm font-medium text-base-content/70">
            デバイス状態
          </h3>
          {allSettings.map((s) => (
            <div
              key={s.source}
              className="text-xs text-base-content/50 flex gap-4"
            >
              <span>
                {s.source === 0 ? "右手 (R)" : "左手 (L)"}
              </span>
              <span>アイドル: {Math.round(s.idleMs / 1000)}秒</span>
              <span>スリープ: {Math.round(s.sleepMs / 60000)}分</span>
            </div>
          ))}
        </section>
      )}

      {/* Apply Button */}
      <div className="flex gap-2 pt-2">
        <Button
          className="rounded bg-primary text-primary-content px-4 py-2 hover:opacity-90 disabled:opacity-50"
          isDisabled={saving}
          onPress={handleApply}
        >
          {saving ? "適用中..." : "適用"}
        </Button>
      </div>

      {/* Feedback */}
      {feedback && <p className="text-sm text-success">{feedback}</p>}

      {/* Telemetry (Tauri only) */}
      {window.__TAURI_INTERNALS__ && (
        <section className="flex flex-col gap-2 pt-4 border-t border-base-300">
          <h3 className="text-sm font-medium text-base-content/70">
            利用データの送信
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isOptedIn}
              onChange={(e) => setOptedIn(e.target.checked)}
              className="toggle toggle-sm"
            />
            <span className="text-sm">
              {isOptedIn ? "送信する" : "送信しない"}
            </span>
          </label>
          <p className="text-sm text-base-content/50">
            匿名の操作ログ・エラー情報・キーマップ設定を開発者に送信します
          </p>
        </section>
      )}
    </div>
  );
}
