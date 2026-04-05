# Keymap Picker Redesign

## Summary

BehaviorBindingPicker (keymap editor) UI redesign. Replace dropdown with tab-based picker that guides beginners while preserving full functionality for advanced users.

## Target User

Split keyboard beginners who purchased minimal-keys. They don't know what a "layer" is, and need guidance on how to use the keyboard effectively.

## Design Principles

- User-first: organize by "what I want to do", not by technical categories
- No technical jargon in user-facing labels
- Start simple, evolve with user feedback
- Don't remove functionality — layer it behind tabs

## Architecture: 3-Tab Picker

When a key is selected on the keyboard view, the picker area (below the keyboard) shows 3 tabs.

### Tab 1: Recommendations

Per-key suggestions based on key role (position on the keyboard).

```
+---------------------------------------------+
| [key role label]: e.g. "right thumb, center" |
|                                              |
| [Enter]    [Space]    [Layer toggle]         |
|  *popular                                    |
|                                              |
| Click a card to apply immediately.           |
| Each card includes preset parameters.        |
+---------------------------------------------+
```

**Data model: Key Role Map**

```typescript
interface KeyRecommendation {
  label: string;            // "Enter"
  description: string;      // "confirm input"
  behaviorId: number;
  param1: number;
  param2: number;
  popular?: boolean;
}

interface KeyRole {
  roleLabel: string;        // "right thumb, center"
  recommendations: KeyRecommendation[];
}

// Indexed by physical key position index
type KeyRoleMap = Record<number, KeyRole>;
```

- JSON data file: `src/keyboard/key-roles.ts`
- Initial scope: thumb keys (6) + frequently changed keys
- Keys without role data: tab shows "select from Use Cases or All"

### Tab 2: Use Cases

Organized by what the user wants to accomplish.

**Categories (initial):**

1. **Common actions** — Copy, Paste, Cut, Undo, Redo, Select All, Save, Find
2. **Productivity** — Switch window, Screenshot, Show desktop, Close tab, New tab, Go to address bar
3. **Using layers** — Momentary (hold), Toggle (on/off), One-shot (next key only)

Each item:
- Japanese label (no jargon): e.g. "Copy" not "Ctrl+C"
- One-line description: e.g. "remember the selected part"
- Pre-configured behaviorId + params (user doesn't need to know about Ctrl)

**Data model:**

```typescript
interface UseCaseItem {
  label: string;           // "Copy"
  description: string;     // "remember the selected part"
  behaviorId: number;
  param1: number;
  param2: number;
}

interface UseCaseCategory {
  id: string;
  label: string;           // "Common actions"
  items: UseCaseItem[];
}
```

- JSON data file: `src/behaviors/use-cases.ts`
- Categories shown as sub-tabs or segmented buttons
- Click to apply immediately

### Tab 3: All

Full behavior list for advanced users. Replaces current dropdown with accordion list.

```
+---------------------------------------------+
| > Basic key operations                       |
|   Key Press / Key Toggle / Hold-Tap / ...    |
| > Layers                                     |
| > Bluetooth                                  |
| > System                                     |
+---------------------------------------------+
```

- Reuses existing `categoryOrder`, `categoryLabels`, `groupedBehaviors` logic
- Accordion (expand/collapse) instead of `<select>` + `<optgroup>`
- Selecting a behavior shows `BehaviorParametersPicker` (unchanged)
- Each item shows Japanese label + description (already implemented in `behavior-descriptions.ts`)

## Component Structure

```
BehaviorBindingPicker (modified)
  |- PickerTabs                    [new]
  |   |- RecommendationsTab        [new]
  |   |   |- RecommendationCard    [new]
  |   |- UseCasesTab               [new]
  |   |   |- UseCaseCategory       [new]
  |   |   |- UseCaseItem           [new]
  |   |- AllBehaviorsTab           [new]
  |       |- BehaviorAccordion     [new]
  |       |- BehaviorParametersPicker (existing, unchanged)
  |- (param pickers, shown only for "All" tab selections)
```

## Data Files

| File | Content | Owner |
|------|---------|-------|
| `src/keyboard/key-roles.ts` | Per-key role + recommendations | Manual (masakazu's design intent) |
| `src/behaviors/use-cases.ts` | Use case categories + items | Manual + research data |
| `src/behaviors/behavior-descriptions.ts` | Existing behavior metadata | Already done |

## Interaction Flow

1. User clicks a key on keyboard view
2. Picker opens with "Recommendations" tab active (if role data exists for that key), otherwise "Use Cases"
3. **Recommendations tab**: click a card -> immediately apply binding, close picker
4. **Use Cases tab**: select category -> click item -> immediately apply binding
5. **All tab**: expand category -> click behavior -> show parameter picker -> apply on param change (current behavior)

## Scope: Initial Release

- 3 tabs with basic styling (Tailwind, consistent with current UI)
- Key role data for thumb keys (6 keys) only
- Use case data: 3 categories, ~20 items total (leverage existing shortcut research)
- "All" tab: accordion version of current dropdown
- No search (future enhancement)
- No drag-and-drop (future enhancement)

## Future Enhancements (not in v1)

- Search bar across all tabs
- App-specific presets (Excel, PowerPoint, etc.)
- "Popular among other users" based on analytics
- Onboarding wizard for first-time setup
- Full key role coverage (all 43 keys)

## Testing Strategy

- Unit tests: key role data lookup, use case data structure validation
- Component tests: tab switching, recommendation card click applies binding
- Manual test: full flow with real keyboard connected via Tauri
