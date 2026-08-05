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
  "External Power",
  "Backlight",
  "RGB Underglow",
  "Key Toggle",
  "Key Repeat",
  "Caps Word",
  "Grave/Escape",
  "Macro",
];

const btCommands = [
  { label: "BT クリア", description: "現在のペアリングを消去", param1: 0, param2: 0 },
  { label: "BT 次へ", description: "次のプロファイルに切替", param1: 1, param2: 0 },
  { label: "BT 前へ", description: "前のプロファイルに切替", param1: 2, param2: 0 },
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
  const btProfileRange = btBehavior?.metadata
    .find((parameters) => parameters.param2.some((parameter) => parameter.range))
    ?.param2.find((parameter) => parameter.range)?.range;
  const btOperations = [
    ...btCommands,
    ...(btProfileRange
      ? Array.from({ length: btProfileRange.max - btProfileRange.min + 1 }, (_, index) => {
          const profile = btProfileRange.min + index;
          return {
            label: `BT プロファイル ${profile}`,
            description: `プロファイル${profile}に切替`,
            param1: 3,
            param2: profile,
          };
        })
      : []),
  ];

  const handleZeroParamClick = (behavior: GetBehaviorDetailsResponse) => {
    onApplyBinding({ behaviorId: behavior.id, param1: 0, param2: 0 });
  };

  const handleBtClick = (param1: number, param2: number) => {
    if (!btBehavior) return;
    onApplyBinding({ behaviorId: btBehavior.id, param1, param2 });
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
                key={`${op.param1}-${op.param2}`}
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md border border-base-300 bg-white hover:bg-primary/10 hover:border-primary/30 transition-all text-left"
                onClick={() => handleBtClick(op.param1, op.param2)}
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
