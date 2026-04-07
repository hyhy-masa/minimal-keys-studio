import { useMemo } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { getBehaviorDescription } from "../behavior-descriptions";

const systemBehaviorNames = [
  "None",
  "Transparent",
  "Bluetooth",
  "Output Selection",
  "Reset",
  "Bootloader",
  "Soft Off",
  "Studio Unlock",
];

// Known Bluetooth operations
const btOperations = [
  { label: "BT クリア", description: "現在のペアリングを消去", param1: 0 },
  { label: "BT 次へ", description: "次のプロファイルに切替", param1: 1 },
  { label: "BT 前へ", description: "前のプロファイルに切替", param1: 2 },
  { label: "BT プロファイル 0", description: "プロファイル0に切替", param1: 3 },
  { label: "BT プロファイル 1", description: "プロファイル1に切替", param1: 4 },
  { label: "BT プロファイル 2", description: "プロファイル2に切替", param1: 5 },
];

interface SystemTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function SystemTab({ behaviors, onApplyBinding }: SystemTabProps) {
  const availableBehaviors = useMemo(
    () => behaviors.filter((b) => systemBehaviorNames.includes(b.displayName)),
    [behaviors],
  );

  // Separate BT from others
  const btBehavior = availableBehaviors.find((b) => b.displayName === "Bluetooth");
  const otherBehaviors = availableBehaviors.filter((b) => b.displayName !== "Bluetooth");

  const handleZeroParamClick = (behavior: GetBehaviorDetailsResponse) => {
    onApplyBinding({ behaviorId: behavior.id, param1: 0, param2: 0 });
  };

  const handleBtClick = (param1: number) => {
    if (!btBehavior) return;
    onApplyBinding({ behaviorId: btBehavior.id, param1, param2: 0 });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Zero-param behaviors */}
      <div className="flex flex-col gap-1">
        {otherBehaviors.map((b) => {
          const desc = getBehaviorDescription(b.displayName);
          return (
            <button
              key={b.id}
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-md border border-base-300 bg-white hover:bg-primary/10 hover:border-primary/30 transition-all text-left"
              onClick={() => handleZeroParamClick(b)}
            >
              <span className="font-medium">{desc.label}</span>
              <span className="text-base-content/50">{desc.description}</span>
            </button>
          );
        })}
      </div>

      {/* Bluetooth operations */}
      {btBehavior && (
        <div>
          <div className="text-sm text-base-content/60 mb-1">Bluetooth操作</div>
          <div className="flex flex-col gap-1">
            {btOperations.map((op) => (
              <button
                key={op.param1}
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md border border-base-300 bg-white hover:bg-primary/10 hover:border-primary/30 transition-all text-left"
                onClick={() => handleBtClick(op.param1)}
              >
                <span className="font-medium">{op.label}</span>
                <span className="text-base-content/50">{op.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
