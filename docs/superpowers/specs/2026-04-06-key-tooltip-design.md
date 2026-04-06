# Key Tooltip (Popover) Design

## Summary

Add hover-triggered popovers to all keys and the rotary encoder on the keyboard view. Popovers show what each key does in plain Japanese, with recommendations and a path to change settings. Solves the problem of beginners not understanding technical labels like "MLayer" or "Key Press".

## Target User

Split keyboard beginners who purchased minimal-keys. They don't know what layers are, what shortcuts exist, or what the encoder does.

## Problem Statement

1. Technical terms are meaningless to beginners ("MLayer", "Key Press" → what?)
2. Layer types and their uses are unclear (momentary? toggle?)
3. Shortcut keys show "Ctrl+C" but users don't connect that to "copy"
4. The encoder is completely opaque without explanation

## Design Approach

Custom popover (Option B) — appears near the hovered key with content adapted to key type. Chosen over native tooltips (can't include recommendations/actions) and side panels (breaks visual proximity).

## Popover Display Rules

### Trigger

- **Hover**: 200ms delay, dismiss on mouse leave
- **Popover itself is hoverable**: user can move mouse into the popover to click recommendations or action links
- **Click**: clicking the key closes the popover and opens the existing picker (current behavior unchanged)

### Position

- Default: above the key
- Auto-adjust: below if no space above
- Implementation: React Aria `useOverlayPosition` or CSS anchor positioning

### Content by Key Type

| Key Type | Detection | Content |
|----------|-----------|---------|
| Letter keys (A-Z, 0-9) | HID Keyboard page, standard keys | Role name only ("A — 文字入力") |
| Shortcut keys (Ctrl+C) | Key Press with modifier flags | Role name + description ("コピー — 選択中のものを記憶する") |
| Layer keys (MLayer, Toggle) | Layer behavior | Role name + description + 2-3 recommendations |
| Mouse keys (click, etc.) | Mouse button behavior | Role name + description ("左クリック — 選択・決定") + recommendations |
| Thumb keys | Position in key-roles.ts | Role name + description + 2-3 recommendations |
| Encoder | Encoder position | Current bindings (rotate/press) + adjustable options + "設定する→" per action |
| Unset/None | No behavior | "未設定 — キーを押しても何も起きません" + recommendations |

### Popover Layouts

**Simple (letter keys):**

```
┌──────────────────┐
│ A — 文字入力      │
└──────────────────┘
```

**Detail (special keys):**

```
┌──────────────────────────┐
│ コピー                    │
│ 選択中のものを記憶する     │
│ ─────────────────────── │
│ おすすめ: Paste  Undo    │
│         「もっと見る →」  │
└──────────────────────────┘
```

**Encoder:**

```
┌──────────────────────────┐
│ 🎛 ロータリーエンコーダ     │
│                           │
│ 回す: 音量調整      設定→  │
│ 押す: Q             設定→  │
│                           │
│ 回すで調整できること:       │
│  音量 / スクロール / BT切替 │
└──────────────────────────┘
```

### Actions

- **Recommendation click**: apply binding immediately (same as existing picker flow)
- **"もっと見る→"**: select the key and open the full picker below (existing flow)
- **"設定する→" (encoder)**: open encoder settings for that action

## Data Structure

### Strategy

Reuse existing data, add a new lookup layer for tooltip content.

| Data | Exists? | Source |
|------|---------|--------|
| Behavior descriptions | Yes | `behavior-descriptions.ts` |
| Shortcut role names | Yes | `use-cases.ts` ("コピー", "貼り付け") |
| Thumb key recommendations | Yes | `key-roles.ts` (5 thumb keys) |
| HID key Japanese role names | **New** | `key-descriptions.ts` |
| Mouse key descriptions | **New** | `key-descriptions.ts` |
| Encoder adjustable options | **New** | `key-descriptions.ts` |

### New File: `src/keyboard/key-descriptions.ts`

```typescript
interface KeyTooltipData {
  roleName: string;           // "コピー" / "A — 文字入力"
  description?: string;       // "選択中のものを記憶する" (undefined for obvious keys)
  recommendations?: KeyRecommendation[];  // 2-3 suggestions (from key-roles.ts or generated)
  changeAction?: string;      // Link target for "設定する→"
}
```

### Reverse Lookup

The tooltip resolves the current binding to a friendly name by:

1. Check `use-cases.ts` — does this binding match a known shortcut? → use its label/description
2. Check `key-roles.ts` — does this position have role data? → use its recommendations
3. Fallback — use HID key name + generic description from `key-descriptions.ts`

## Component Structure

```
Key.tsx (modify — add hover events)
  ├─ onMouseEnter/Leave → hover state
  └─ KeyTooltip.tsx (new)
       ├─ SimpleTooltip     — letter keys (role name only)
       ├─ DetailTooltip     — special keys (role + description + recommendations)
       └─ EncoderTooltip    — encoder (rotate/press + adjustable list)
```

### Impact on Existing Code

| File | Change |
|------|--------|
| `Key.tsx` | Add hover event handlers, render `KeyTooltip` |
| `Keyboard.tsx` | Pass binding info as props for tooltip |
| `BehaviorBindingPicker.tsx` | No change |
| `PhysicalLayout.tsx` | No change |

## Scope

### In Scope (v1)

- Popovers on all 43 keys + encoder
- Content adapted by key type
- Reverse lookup from use-cases.ts and key-roles.ts
- 2-3 recommendations + "もっと見る→" / "設定する→" actions
- Click recommendation to apply immediately

### Out of Scope (future)

- Search functionality (backlog item #4)
- Trackball speed adjustment in keyboard view (backlog item #9)
- Onboarding tour integration (backlog item #2)

## Success Criteria

1. Beginners understand what each key does by hovering — no need to click
2. Encoder usage is self-explanatory from the popover
3. Popover → setting change flow feels natural (not jarring)

## Testing Strategy

- Unit tests: KeyTooltipData generation, reverse lookup logic
- Component tests: tooltip rendering for each key type
- Manual test: hover all key types + encoder on real device via Tauri
