import { useCallback, useRef, useState } from "react";
import { Button } from "react-aria-components";
import {
  useCustomSubsystem,
  useCustomNotification,
} from "../rpc/useCustomSubsystem";
import * as SETTINGS from "../proto/settings";

export function DeviceSettings() {
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
      .catch((e: unknown) =>
        console.error("Failed to request all activity settings:", e)
      );
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
      setFeedback("Settings applied");
    } catch (e) {
      console.error("Failed to apply settings:", e);
      setFeedback("Failed to apply settings");
    } finally {
      setSaving(false);
    }
  }, [subsystem, idleSeconds, sleepMinutes]);

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
      setFeedback("All devices synced");
    } catch (e) {
      console.error("Failed to sync settings:", e);
      setFeedback("Failed to sync settings");
    } finally {
      setSaving(false);
    }
  }, [subsystem, idleSeconds, sleepMinutes, allSettings]);

  if (!subsystem) {
    return (
      <div className="p-4 text-base-content/60">
        <p>Settings module is not available.</p>
        <p className="text-sm mt-2">
          Firmware needs <code>CONFIG_ZMK_SETTINGS_RPC_STUDIO=y</code>
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <h2 className="text-lg font-semibold">Device Settings</h2>

      {/* Sync Warning */}
      {outOfSync && (
        <div className="rounded-lg border border-warning bg-warning/10 p-3 flex items-center justify-between">
          <p className="text-sm text-warning">
            Settings are out of sync across devices.
          </p>
          <Button
            className="rounded bg-warning text-warning-content px-3 py-1 text-sm"
            isDisabled={saving}
            onPress={handleSync}
          >
            Sync All
          </Button>
        </div>
      )}

      {/* Idle Timeout */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-base-content/70">
          Idle Timeout
        </h3>
        <p className="text-xs text-base-content/50">
          Time before the keyboard enters idle mode (LEDs off). Set to 0 to
          disable.
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
          <span className="text-sm text-base-content/60">seconds</span>
        </div>
      </section>

      {/* Sleep Timeout */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-base-content/70">
          Sleep Timeout
        </h3>
        <p className="text-xs text-base-content/50">
          Time before the keyboard enters deep sleep. Set to 0 to disable.
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
          <span className="text-sm text-base-content/60">minutes</span>
        </div>
      </section>

      {/* Per-Device Info */}
      {allSettings.length > 0 && (
        <section className="flex flex-col gap-2 pt-2 border-t border-base-300">
          <h3 className="text-sm font-medium text-base-content/70">
            Device Status
          </h3>
          {allSettings.map((s) => (
            <div
              key={s.source}
              className="text-xs text-base-content/50 flex gap-4"
            >
              <span>
                {s.source === 0 ? "Central (R)" : "Peripheral (L)"}
              </span>
              <span>Idle: {Math.round(s.idleMs / 1000)}s</span>
              <span>Sleep: {Math.round(s.sleepMs / 60000)}min</span>
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
          {saving ? "Applying..." : "Apply"}
        </Button>
      </div>

      {/* Feedback */}
      {feedback && <p className="text-sm text-success">{feedback}</p>}
    </div>
  );
}
