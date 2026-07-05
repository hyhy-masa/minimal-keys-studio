import { Construction } from "lucide-react";

/**
 * Placeholder shown in place of the Combos tab while the combo feature is
 * being reworked. Mounting this instead of <ComboSettings /> means the combo
 * RPCs (getAllCombos etc.) never fire, keeping the combo tab out of the RPC
 * path until the feature resumes. See docs for the combo known-issues writeup.
 */
export function ComboComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-8">
      <div className="w-16 h-16 rounded-full bg-base-200 flex items-center justify-center">
        <Construction className="w-8 h-8 text-base-content/30" />
      </div>
      <div className="text-center max-w-md">
        <h3 className="text-lg font-medium text-base-content/80 mb-2">
          コンボキー設定は準備中です
        </h3>
        <p className="text-sm text-base-content/50">
          この機能は現在準備中です。次のアップデートで対応予定です。
        </p>
      </div>
    </div>
  );
}
