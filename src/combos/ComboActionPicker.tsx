import { Fragment, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { hid_usage_from_page_and_id, hid_usage_page_and_id_from_usage } from "../hid-usages";
import { useOsMode } from "../OsModeContext";
import type { Binding } from "../proto/combos";
import {
  LEFT_MODIFIERS,
  comboShortcutParts,
  isKeyPressBinding,
  mergePickedBinding,
  modifierNames,
  withModifiers,
} from "./combo-shortcut";

const KEYBOARD_PAGE = 7;

// Enter sits three clicks deep in the tabs (文字・記号 > 特殊 > Enter), which is
// where the Alt+Enter customer got lost.
// Arrows and Home/End only exist under ショートカット > ナビゲーション, so
// Ctrl+Shift+← was just as hard to find.
const KEY_GROUPS = [
  {
    id: "frequent",
    heading: "よく使うキー",
    keys: [
      { label: "Enter", hidId: 40 },
      { label: "Tab", hidId: 43 },
      { label: "Space", hidId: 44 },
      { label: "Esc", hidId: 41 },
      { label: "BS", hidId: 42 },
      { label: "Delete", hidId: 76 },
    ],
  },
  {
    id: "navigation",
    heading: "矢印・移動キー",
    keys: [
      { label: "↑", hidId: 82 },
      { label: "↓", hidId: 81 },
      { label: "←", hidId: 80 },
      { label: "→", hidId: 79 },
      { label: "Home", hidId: 74 },
      { label: "End", hidId: 77 },
      { label: "PageUp", hidId: 75 },
      { label: "PageDown", hidId: 78 },
    ],
  },
];

const KEY_NOT_CHOSEN = "キー未選択";

const CHIP_BASE =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border-2 px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const CHIP_ON = "border-primary bg-primary font-bold text-primary-content";
const CHIP_OFF =
  "border-base-300 bg-base-100 font-medium text-base-content hover:border-primary hover:bg-base-200";

interface ComboActionPickerProps {
  binding: Binding | null;
  /** Modifiers chosen while no plain key is set yet. Owned by the parent so saving can be blocked. */
  pendingModifiers: number;
  onPendingModifiersChange: (flags: number) => void;
  onBindingChange: (binding: Binding) => void;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; index: number; name: string }[];
  /** Text for an action that is not a plain key, such as switching layers. */
  otherActionLabel?: string | null;
}

export function ComboActionPicker({
  binding,
  pendingModifiers,
  onPendingModifiersChange,
  onBindingChange,
  behaviors,
  layers,
  otherActionLabel,
}: ComboActionPickerProps) {
  const { osMode } = useOsMode();
  const [notice, setNotice] = useState<string | null>(null);
  const keyBinding = isKeyPressBinding(binding, behaviors) ? binding : null;
  // With a plain key set, the saved value is the only source of truth for the chips.
  const flags = keyBinding ? (keyBinding.param1 >>> 24) & 0xff : pendingModifiers;
  const currentHidId = keyBinding ? hid_usage_page_and_id_from_usage(keyBinding.param1) : null;
  const keyPressId = behaviors.find((b) => b.displayName === "Key Press")?.id;

  const toggleModifier = (mask: number) => {
    const next = flags ^ mask; // xor keeps right-hand modifiers, which have no chip
    setNotice(null);
    if (keyBinding) {
      onBindingChange({ ...keyBinding, param1: withModifiers(keyBinding.param1, next) });
    } else {
      onPendingModifiersChange(next);
    }
  };

  const applyBinding = (next: Binding) => {
    const nextFlags = isKeyPressBinding(next, behaviors) ? (next.param1 >>> 24) & 0xff : 0;
    // A chip going dark on its own must be said out loud, or Ctrl+Shift+T
    // quietly becomes Ctrl+T.
    setNotice(
      (flags & ~nextFlags) === 0
        ? null
        : nextFlags === 0
          ? "選んだ内容に合わせて、修飾キーを外しました。"
          : "選んだ内容に合わせて、修飾キーを切り替えました。",
    );
    onPendingModifiersChange(0);
    onBindingChange(next);
  };

  const parts = keyBinding
    ? comboShortcutParts(keyBinding.param1, osMode)
    : flags
      ? [...modifierNames(flags, osMode), KEY_NOT_CHOSEN]
      : [];
  const hint = keyBinding
    ? null
    : flags
      ? "未完成です。Enter などのキーを1つ選んでください。"
      : otherActionLabel
        ? null
        : "下からキーや動作を選んでください。";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="sticky top-0 z-10 flex min-h-16 min-w-0 flex-col gap-1 rounded-lg border border-primary/40 bg-base-100 px-3 py-3 shadow-sm">
        <span className="text-sm font-medium text-base-content/70">送るキー・動作</span>
        <div
          data-testid="combo-action-result"
          aria-live="polite"
          aria-atomic="true"
          className="flex flex-wrap items-center gap-1.5 break-words text-lg font-semibold leading-snug"
        >
          {parts.length === 0 ? (
            <span>{otherActionLabel || "未選択"}</span>
          ) : (
            parts.map((part, i) => (
              <Fragment key={`${i}-${part}`}>
                {i > 0 && <span className="font-normal text-base-content/50">+</span>}
                {part === KEY_NOT_CHOSEN ? (
                  <span className="text-base font-medium text-base-content/60">{part}</span>
                ) : (
                  <kbd className="rounded-md border border-b-2 border-base-300 bg-base-100 px-2 py-0.5 font-sans">
                    {part}
                  </kbd>
                )}
              </Fragment>
            ))
          )}
        </div>
        {(notice ?? hint) && <p className="text-sm text-base-content/60">{notice ?? hint}</p>}
      </div>

      <div role="group" aria-labelledby="combo-modifiers-heading" className="flex flex-col gap-1.5">
        <h4 id="combo-modifiers-heading" className="text-sm font-medium">
          送るキーに付ける修飾キー
        </h4>
        <div className="flex flex-wrap gap-2">
          {LEFT_MODIFIERS.map((m) => {
            const pressed = (flags & m.mask) !== 0;
            return (
              <button
                key={m.mask}
                type="button"
                aria-pressed={pressed}
                onClick={() => toggleModifier(m.mask)}
                className={`${CHIP_BASE} ${pressed ? CHIP_ON : CHIP_OFF}`}
              >
                {m[osMode]}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-base-content/60">
          {`複数選べます（例: ${osMode === "mac" ? "⌘ Cmd + Shift + T" : "Ctrl + Shift + T"}）。もう一度押すと外れます。下のキーと、どちらから選んでもかまいません。`}
        </p>
      </div>

      {keyPressId !== undefined && (
        <div className="flex flex-col gap-2">
          {KEY_GROUPS.map((group) => (
            <div key={group.id} role="group" aria-labelledby={`combo-${group.id}-heading`} className="flex flex-col gap-1.5">
              <h4 id={`combo-${group.id}-heading`} className="text-sm font-medium">{group.heading}</h4>
              <div className="flex flex-wrap gap-2">
                {group.keys.map((key) => {
                  // The top byte of the page half holds the modifier flags.
                  const pressed = !!currentHidId && (currentHidId[0] & 0xff) === KEYBOARD_PAGE && currentHidId[1] === key.hidId;
                  return (
                    <button
                      key={key.hidId}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() =>
                        applyBinding({
                          behaviorId: keyPressId,
                          param1: withModifiers(hid_usage_from_page_and_id(KEYBOARD_PAGE, key.hidId), flags),
                          param2: 0,
                        })
                      }
                      className={`${CHIP_BASE} ${pressed ? CHIP_ON : CHIP_OFF}`}
                    >
                      {key.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-sm text-base-content/60">キーは1つ選びます。別のキーを選ぶと入れ替わります。</p>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-1.5">
        <h4 className="text-sm font-medium">ほかのキー・動作</h4>
        <p className="text-sm text-base-content/60">文字やショートカット、レイヤー操作も選べます。</p>
        <BehaviorBindingPicker
          binding={binding ?? { behaviorId: 0, param1: 0, param2: 0 }}
          behaviors={behaviors}
          layers={layers}
          showCurrent={false}
          initialTab="letters"
          onBindingChanged={(b: BehaviorBinding, source) =>
            applyBinding(
              mergePickedBinding(
                { behaviorId: b.behaviorId, param1: (b.param1 ?? 0) >>> 0, param2: b.param2 ?? 0 },
                flags,
                source,
                behaviors,
              ),
            )
          }
        />
      </div>
    </div>
  );
}
