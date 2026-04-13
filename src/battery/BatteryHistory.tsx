import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { SubsystemUnavailable } from "../misc/SubsystemUnavailable";
import {
  useCustomSubsystem,
  useCustomNotification,
} from "../rpc/useCustomSubsystem";
import * as BAT from "../proto/battery";

interface BatteryEntry {
  timestamp: number;
  level: number;
}

interface DeviceBatteryData {
  sourceId: number;
  entries: BatteryEntry[];
  totalEntries: number;
  loaded: number;
}

function getBatteryColor(level: number): string {
  if (level > 60) return "#22c55e";
  if (level > 30) return "#eab308";
  return "#ef4444";
}

function getBatteryStatus(level: number): string {
  if (level > 80) return "良好";
  if (level > 60) return "普通";
  if (level > 30) return "残り少ない";
  if (level > 10) return "低下";
  return "要充電";
}

function formatTimeAgo(seconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - seconds;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400)
    return `${Math.floor(diff / 3600)}時間${Math.floor((diff % 3600) / 60)}分前`;
  return `${Math.floor(diff / 86400)}日前`;
}

function BatteryChart({ entries }: { entries: BatteryEntry[] }) {
  const width = 500;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-base-content/40 text-sm">
        バッテリー履歴データがありません
      </div>
    );
  }

  const minTime = entries[0].timestamp;
  const maxTime = entries[entries.length - 1].timestamp;
  const timeRange = maxTime - minTime || 1;

  const points = entries.map((e) => ({
    x: padding.left + ((e.timestamp - minTime) / timeRange) * chartWidth,
    y: padding.top + (1 - e.level / 100) * chartHeight,
    level: e.level,
    timestamp: e.timestamp,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <defs>
        <linearGradient id="batteryGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {[0, 25, 50, 75, 100].map((level) => {
        const y = padding.top + (1 - level / 100) * chartHeight;
        return (
          <g key={level}>
            <line
              x1={padding.left}
              y1={y}
              x2={padding.left + chartWidth}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.1}
            />
            <text
              x={padding.left - 5}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="currentColor"
              fillOpacity={0.5}
            >
              {level}%
            </text>
          </g>
        );
      })}

      <path d={areaPath} fill="url(#batteryGradient)" />
      <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="2" />

      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          fill={getBatteryColor(p.level)}
          stroke="white"
          strokeWidth="1"
        >
          <title>
            {p.level}% - {formatTimeAgo(p.timestamp)}
          </title>
        </circle>
      ))}
    </svg>
  );
}

function BatteryIndicator({
  level,
  label,
}: {
  level: number;
  label?: string;
}) {
  const color = getBatteryColor(level);
  const status = getBatteryStatus(level);

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-12 h-6 border-2 rounded border-base-content/30">
        <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-1 h-3 bg-base-content/30 rounded-r" />
        <div
          className="h-full rounded-sm transition-all"
          style={{
            width: `${Math.min(100, Math.max(0, level))}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <div>
        <span className="text-sm font-medium">{level}%</span>
        <span className="text-xs text-base-content/50 ml-1">{status}</span>
        {label && (
          <span className="text-xs text-base-content/40 ml-1">({label})</span>
        )}
      </div>
    </div>
  );
}

export function BatteryHistory() {
  const subsystem = useCustomSubsystem(BAT.SUBSYSTEM_ID);
  const [deviceData, setDeviceData] = useState<Map<number, DeviceBatteryData>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef(false);

  // Listen for streaming battery history notifications
  useCustomNotification(subsystem?.subsystemIndex, (payload) => {
    const notif = BAT.decodeNotification(payload);
    if (!notif) return;

    setDeviceData((prev) => {
      const next = new Map(prev);
      const existing = next.get(notif.sourceId) ?? {
        sourceId: notif.sourceId,
        entries: [],
        totalEntries: notif.totalEntries,
        loaded: 0,
      };

      const entries = [
        ...existing.entries,
        {
          timestamp: notif.entry.timestamp,
          level: notif.entry.batteryLevel,
        },
      ];

      next.set(notif.sourceId, {
        ...existing,
        entries,
        totalEntries: notif.totalEntries,
        loaded: notif.entryIndex + 1,
      });

      if (notif.isLast) {
        pendingRef.current = false;
        setLoading(false);
      }

      return next;
    });
  });

  const fetchHistory = useCallback(async () => {
    if (!subsystem || pendingRef.current) return;
    setLoading(true);
    pendingRef.current = true;
    setDeviceData(new Map());
    try {
      await subsystem.callRPC(BAT.encodeGetHistory());
      // Data arrives via notifications
    } catch (e) {
      console.error("Failed to request battery history:", e);
      setLoading(false);
      pendingRef.current = false;
    }
  }, [subsystem]);

  // Auto-fetch on connect
  const prevSubsystem = useRef(subsystem);
  if (subsystem && !prevSubsystem.current) {
    fetchHistory();
  }
  prevSubsystem.current = subsystem;

  const devices = useMemo(() => {
    return Array.from(deviceData.values())
      .sort((a, b) => a.sourceId - b.sourceId)
      .map((d) => {
        const sortedEntries = [...d.entries].sort(
          (a, b) => a.timestamp - b.timestamp
        );
        const currentLevel =
          sortedEntries.length > 0
            ? sortedEntries[sortedEntries.length - 1].level
            : 0;
        const name = d.sourceId === 0 ? "右手 (R)" : "左手 (L)";

        let drainRate = 0;
        let estimatedHours = 0;
        if (sortedEntries.length >= 2) {
          const first = sortedEntries[0];
          const last = sortedEntries[sortedEntries.length - 1];
          const hours = (last.timestamp - first.timestamp) / 3600;
          const drain = first.level - last.level;
          drainRate = hours > 0 ? drain / hours : 0;
          estimatedHours = drainRate > 0 ? last.level / drainRate : 0;
        }

        return {
          ...d,
          entries: sortedEntries,
          currentLevel,
          name,
          drainRate,
          estimatedHours,
        };
      });
  }, [deviceData]);

  if (!subsystem) {
    return (
      <SubsystemUnavailable
        featureName="バッテリー情報"
        explanation="キーボードのファームウェアがこの機能に対応していないか、接続方法を確認してください。"
        technicalDetails="CONFIG_ZMK_BATTERY_HISTORY_STUDIO_RPC=y"
      />
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">バッテリー</h2>
        <Button
          className="text-xs rounded bg-base-300 hover:bg-base-200 px-2 py-1"
          isDisabled={loading}
          onPress={fetchHistory}
        >
          {loading ? "読み込み中..." : "更新"}
        </Button>
      </div>

      {/* Current Levels */}
      {devices.length > 0 && (
        <section className="flex gap-4">
          {devices.map((d) => (
            <BatteryIndicator
              key={d.sourceId}
              level={d.currentLevel}
              label={d.name}
            />
          ))}
        </section>
      )}

      {/* Charts */}
      {devices.map((d) => (
        <section key={d.sourceId} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{d.name}</h3>
          <div className="bg-base-100 rounded-lg p-2 border border-base-300">
            <BatteryChart entries={d.entries} />
          </div>
          <div className="flex gap-4 text-xs text-base-content/50">
            <span>消耗: {d.drainRate.toFixed(1)}%/時</span>
            {d.estimatedHours > 0 && (
              <span>残り推定: {Math.floor(d.estimatedHours)}時間</span>
            )}
          </div>
        </section>
      ))}

      {devices.length === 0 && !loading && (
        <p className="text-sm text-base-content/50">
          バッテリーデータがありません。「更新」をクリックして履歴を読み込んでください。
        </p>
      )}
    </div>
  );
}
