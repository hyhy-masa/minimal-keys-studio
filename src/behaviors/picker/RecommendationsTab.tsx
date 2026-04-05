import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { keyRoleMap } from "../../keyboard/key-roles";
import { resolveBehaviorId } from "../resolve-behavior";

interface RecommendationsTabProps {
  keyPosition: number;
  behaviors: GetBehaviorDetailsResponse[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function RecommendationsTab({
  keyPosition,
  behaviors,
  onApplyBinding,
}: RecommendationsTabProps) {
  const role = keyRoleMap[keyPosition];

  if (!role) {
    return (
      <div className="px-3 py-4 text-sm text-base-content/50">
        このキーのおすすめはまだありません。「用途別」または「すべて」から選んでください。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-base-content/60 px-1">{role.roleLabel}</p>
      <div className="flex gap-2 flex-wrap">
        {role.recommendations.map((rec) => {
          const behaviorId = resolveBehaviorId(rec.behaviorDisplayName, behaviors);
          if (behaviorId === undefined) return null;
          return (
            <button
              key={`${rec.behaviorDisplayName}-${rec.param1}-${rec.param2}`}
              className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg border border-base-300 hover:border-primary hover:bg-primary/5 transition-all min-w-[5rem]"
              onClick={() =>
                onApplyBinding({
                  behaviorId,
                  param1: rec.param1,
                  param2: rec.param2,
                })
              }
            >
              <span className="text-sm font-medium">{rec.label}</span>
              {rec.popular && (
                <span className="text-[10px] text-primary">人気</span>
              )}
              <span className="text-xs text-base-content/40">{rec.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
