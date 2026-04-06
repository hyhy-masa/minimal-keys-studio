import { useContext, useEffect, useState } from "react";
import { useCustomSubsystem } from "../rpc/useCustomSubsystem";
import * as RSR from "../proto/rsr";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { getBehaviorDescription } from "../behaviors/behavior-descriptions";

export interface EncoderBindingSummary {
  cwLabel: string;
  ccwLabel: string;
  rotationLabel: string; // Combined label like "音量調整"
}

export function useEncoderBindings(
  behaviors: GetBehaviorDetailsResponse[],
  selectedLayer: number,
): EncoderBindingSummary | null {
  const subsystem = useCustomSubsystem(RSR.SUBSYSTEM_ID);
  const lockState = useContext(LockStateContext);
  const [summary, setSummary] = useState<EncoderBindingSummary | null>(null);

  useEffect(() => {
    if (
      !subsystem ||
      lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED ||
      behaviors.length === 0
    ) {
      setSummary(null);
      return;
    }

    let ignore = false;

    async function load() {
      try {
        // Discover sensors first
        const sensorsResp = await subsystem!.callRPC(RSR.encodeGetSensors());
        const decoded = RSR.decodeResponse(sensorsResp);
        if (ignore) return;

        const sensors = decoded.getSensors?.sensors ?? [];
        if (sensors.length === 0) return;

        // Load bindings for the first sensor
        const bindResp = await subsystem!.callRPC(
          RSR.encodeGetAllLayerBindings(sensors[0].index)
        );
        const bindDecoded = RSR.decodeResponse(bindResp);
        if (ignore) return;

        const layerBindings = bindDecoded.getAllLayerBindings?.bindings ?? [];
        const lb = layerBindings.find((b) => b.layer === selectedLayer);

        if (lb) {
          const cwBehavior = lb.cwBinding
            ? behaviors.find((b) => b.id === lb.cwBinding!.behaviorId)
            : null;
          const ccwBehavior = lb.ccwBinding
            ? behaviors.find((b) => b.id === lb.ccwBinding!.behaviorId)
            : null;

          const cwDesc = cwBehavior
            ? getBehaviorDescription(cwBehavior.displayName)
            : null;
          const ccwDesc = ccwBehavior
            ? getBehaviorDescription(ccwBehavior.displayName)
            : null;

          const cwLabel = cwDesc?.label ?? "未設定";
          const ccwLabel = ccwDesc?.label ?? "未設定";

          // Derive rotation label: if CW and CCW are both key presses, show a combined label
          const rotationLabel = deriveRotationLabel(cwLabel, ccwLabel);

          if (!ignore) setSummary({ cwLabel, ccwLabel, rotationLabel });
        }
      } catch (e) {
        console.debug("[useEncoderBindings] Failed to load:", e);
      }
    }

    load();
    return () => { ignore = true; };
  }, [subsystem, lockState, behaviors, selectedLayer]);

  return summary;
}

function deriveRotationLabel(cwLabel: string, ccwLabel: string): string {
  // Try to find a common theme
  if (cwLabel.includes("音量") || ccwLabel.includes("音量")) return "音量調整";
  if (cwLabel.includes("スクロール") || ccwLabel.includes("スクロール")) return "スクロール";
  if (cwLabel.includes("Bluetooth") || ccwLabel.includes("Bluetooth")) return "Bluetooth切替";
  return `${cwLabel} / ${ccwLabel}`;
}
