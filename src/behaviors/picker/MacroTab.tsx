import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { useMacros } from "../../macros/MacrosContext";
import { slotLabel } from "../../macros/macro-model";
import { findMacroBehavior } from "../../macros/macro-labels";

interface MacroTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function MacroTab({ behaviors, onApplyBinding }: MacroTabProps) {
  const { status, macros } = useMacros();
  const behavior = findMacroBehavior(behaviors);
  if (!behavior) return null;

  if (status === "loading") {
    return <p className="text-sm text-base-content/50">マクロを読み込み中...</p>;
  }
  if (status === "error") {
    return <p className="text-sm text-base-content/60">マクロの一覧を読めませんでした。「マクロ」タブで読み直してください。</p>;
  }

  const sorted = [...macros].sort((a, b) => a.index - b.index);
  if (sorted.length === 0) {
    return <p className="text-sm text-base-content/60">まだマクロがありません。画面上の「マクロ」タブで作ると、ここから選べます。</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {sorted.map((m) => (
        <button
          key={m.index}
          type="button"
          aria-label={`${slotLabel(m.index)} ${m.name || "（名前なし）"}`}
          className="flex min-h-11 items-center gap-2 rounded px-3 text-left text-sm hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => onApplyBinding({ behaviorId: behavior.id, param1: m.index, param2: 0 })}
        >
          <span className="font-mono font-medium">{slotLabel(m.index)}</span>
          <span className="truncate">{m.name || "（名前なし）"}</span>
        </button>
      ))}
    </div>
  );
}
