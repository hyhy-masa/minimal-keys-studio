# Visual Refinement Design — Oryx-Inspired

## Summary

Improve visual quality and readability of the keyboard configurator UI. White-based color scheme with vivid blue accent, increased key spacing, stronger selection highlight, and card-style picker.

## Target User

Split keyboard beginners using minimal-keys. They expect a polished, professional app — not a developer tool.

## Problem Statement

1. Keys feel cramped — not enough spacing between them
2. Color scheme lacks contrast — selected key doesn't stand out enough
3. Picker area uses small buttons — hard to read and click
4. Overall impression is "developer tool" rather than "consumer product"

## Approach

Focused improvements on keyboard view and picker area (Approach A). Theme variables change globally, but structural changes are limited to the keyboard and picker components.

## Section 1: Color Scheme

Replace the current purple theme with a white-based + blue accent scheme.

### Tailwind Theme Changes

| Token | Current | New | Notes |
|-------|---------|-----|-------|
| `--color-base-100` | `#F2F2F2` | `#FFFFFF` | App background → white |
| `--color-base-200` | gray | `#F8F9FA` | Sidebar, subtle backgrounds |
| `--color-base-300` | mid gray | `#E5E7EB` | Borders |
| `--color-base-content` | dark | `#1F2937` | Text color → dark gray |
| `--color-primary` | purple oklch(49%) | blue oklch(55% 0.25 250) | Main accent → vivid blue |
| `--color-primary-content` | white | `#FFFFFF` | Text on primary |
| `--color-secondary` | pink | `oklch(60% 0.15 280)` | Subtle purple for secondary actions |
| `--color-accent` | cyan | `oklch(70% 0.2 190)` | Keep teal for accent |

### Dark Mode

Out of scope for this iteration. Light mode only. Existing dark mode values remain unchanged — they will look slightly inconsistent with the new light theme, but dark mode is not the primary use case for initial release. Dark mode alignment is a future task.

## Section 2: Keyboard View

### Key Spacing

Increase visible gap between keys by reducing keycap size within its allocated space.

**Key.tsx changes:**
- Current: `pixelWidth = width * oneU - 2` (2px total reduction)
- New: `pixelWidth = width * oneU - 6` (6px total reduction → 3px gap per side)
- Same for height: `pixelHeight = height * oneU - 6`
- `oneU` stays at 48px

### Keyboard Area Background

- Keyboard container background: `bg-gray-100` (`#F3F4F6`) — subtle contrast against white keys
- Keys remain `bg-white` with shadow → keys "float" above the background

### Selected Key Highlight

- Current: `bg-primary scale-[0.97]` with inset shadow
- New: `bg-primary scale-[0.97] ring-2 ring-primary/40` — keep press-in feel + add glow
- `ring-2` (2px width) fits within the 3px gap between keys without overlapping neighbors
- The ring creates a visible "aura" around the selected key while the scale keeps the tactile feel

### Key Shadows (non-selected)

- Current: `shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.08)]`
- New: `shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.06)]` — cleaner drop shadow, no inset (more modern)
- Hover: `shadow-[0_4px_12px_rgba(0,0,0,0.15)]` with `scale-105`

### Key Font

- oneU stays at 48 → font sizes stay the same
- Key gap increase makes each key slightly smaller visually, but text remains readable at `Math.max(10, oneU * 0.17)` = 10px

## Section 3: Picker Area (Card UI)

### Tab Switcher

- Current: text buttons with active state
- New: segment control style — rounded container with background, active tab has `bg-white shadow-sm` (pill style)

```
Current:  [おすすめ]  [用途別]  [自分で選ぶ]
New:      ┌─────────────────────────────────────┐
          │ [おすすめ]  用途別   自分で選ぶ      │
          └─────────────────────────────────────┘
          (selected tab has white bg + shadow inside gray container)
```

### Recommendations Tab — Card Layout

Current: small buttons in a row
New: larger cards with more padding and description

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   スペース    │ │    Enter     │ │ 一時レイヤー  │
│  スペースキー  │ │  確定・改行   │ │ 押している間  │
│    ★人気     │ │              │ │  だけ切替     │
└──────────────┘ └──────────────┘ └──────────────┘
```

Card styling:
- `px-5 py-4` padding (up from `px-4 py-3`)
- `rounded-xl` (up from `rounded-lg`)
- `border border-base-300` with `hover:border-primary hover:shadow-md`
- Label: `text-base font-medium`
- Description: `text-sm text-base-content/60`
- Popular badge: `text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full`

### Use Cases Tab

- Item padding: `py-2` → `py-3`
- Hover background: `hover:bg-base-200` → `hover:bg-primary/5` (blue tint)
- Description line-height: add `leading-relaxed`

### All Behaviors Tab

- Accordion header padding: `py-1.5` → `py-2.5`
- Item padding: `py-1` → `py-2`
- Description: add `leading-relaxed`

## Section 4: Scope

### In Scope

- Tailwind theme color changes (light mode only)
- Key gap increase (keycap size reduction)
- Key shadow modernization
- Selected key glow effect
- Keyboard area background contrast
- Picker tab segment control style
- Recommendation cards enlargement
- Picker item padding/spacing increase

### Out of Scope

- Header/navigation restructure
- Sidebar redesign
- Animation additions
- Custom fonts (keep Inter)
- Responsive/mobile layout
- Dark mode alignment (future task)
- Onboarding tour (separate backlog item)

## Success Criteria

1. Keys have visible spacing between them — not touching
2. Selected key is immediately identifiable (glow effect)
3. Picker recommendations are large, readable cards
4. Overall impression shifts from "dev tool" to "consumer product"
5. All existing tests still pass
6. No regression in keyboard/picker functionality

## Testing Strategy

- Visual: manual verification via `npm run tauri dev`
- Functional: existing 59 tests cover picker and key behavior
- No new tests needed (CSS-only changes don't warrant unit tests)
