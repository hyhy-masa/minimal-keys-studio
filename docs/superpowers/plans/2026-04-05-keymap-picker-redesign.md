# Keymap Picker Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the keymap editor's dropdown with a 3-tab picker (Recommendations / Use Cases / All) that guides beginners while preserving advanced functionality.

**Architecture:** Data-driven approach. Key roles and use cases are defined as TypeScript data files with displayName-based behavior references (resolved at runtime against the connected keyboard's behavior list). Three tab components share an `onApplyBinding` callback that calls the existing `onBindingChanged` prop. The "All" tab extracts the current dropdown into an accordion.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, @testing-library/react

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/behaviors/resolve-behavior.ts` | Resolve displayName → behaviorId at runtime |
| Create | `src/behaviors/resolve-behavior.test.ts` | Tests for resolver |
| Create | `src/behaviors/use-cases.ts` | Use case categories + items data |
| Create | `src/behaviors/use-cases.test.ts` | Tests for use case data integrity |
| Create | `src/keyboard/key-roles.ts` | Per-key role + recommendations data |
| Create | `src/keyboard/key-roles.test.ts` | Tests for key role data integrity |
| Create | `src/behaviors/picker/PickerTabs.tsx` | Tab container with switching logic |
| Create | `src/behaviors/picker/RecommendationsTab.tsx` | Per-key recommendation cards |
| Create | `src/behaviors/picker/UseCasesTab.tsx` | Use case categories + items |
| Create | `src/behaviors/picker/AllBehaviorsTab.tsx` | Accordion list (extracted from current dropdown) |
| Create | `src/behaviors/picker/PickerTabs.test.tsx` | Component tests for tabs |
| Modify | `src/behaviors/BehaviorBindingPicker.tsx` | Replace `<select>` with `<PickerTabs>` |

---

### Task 1: Behavior Resolver

Runtime lookup to convert displayName → behaviorId from the connected keyboard's behavior list.

**Files:**
- Create: `src/behaviors/resolve-behavior.ts`
- Create: `src/behaviors/resolve-behavior.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/behaviors/resolve-behavior.test.ts
import { describe, it, expect } from "vitest";
import { resolveBehaviorId } from "./resolve-behavior";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

const fakeBehaviors: GetBehaviorDetailsResponse[] = [
  { id: 1, displayName: "Key Press", metadata: [] },
  { id: 2, displayName: "Momentary Layer", metadata: [] },
  { id: 3, displayName: "Hold-Tap", metadata: [] },
];

describe("resolveBehaviorId", () => {
  it("returns behaviorId for known displayName", () => {
    expect(resolveBehaviorId("Key Press", fakeBehaviors)).toBe(1);
    expect(resolveBehaviorId("Momentary Layer", fakeBehaviors)).toBe(2);
  });

  it("returns undefined for unknown displayName", () => {
    expect(resolveBehaviorId("Nonexistent", fakeBehaviors)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/behaviors/resolve-behavior.test.ts`
Expected: FAIL — `resolveBehaviorId` not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/behaviors/resolve-behavior.ts
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

export function resolveBehaviorId(
  displayName: string,
  behaviors: GetBehaviorDetailsResponse[]
): number | undefined {
  return behaviors.find((b) => b.displayName === displayName)?.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/behaviors/resolve-behavior.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/behaviors/resolve-behavior.ts src/behaviors/resolve-behavior.test.ts
git commit -m "feat: add behavior displayName resolver for picker data"
```

---

### Task 2: Use Case Data

Define use case categories and items. Each item references a behavior by displayName and includes pre-computed HID params.

**Files:**
- Create: `src/behaviors/use-cases.ts`
- Create: `src/behaviors/use-cases.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/behaviors/use-cases.test.ts
import { describe, it, expect } from "vitest";
import { useCaseCategories, UseCaseCategory } from "./use-cases";

describe("useCaseCategories", () => {
  it("exports an array of categories", () => {
    expect(Array.isArray(useCaseCategories)).toBe(true);
    expect(useCaseCategories.length).toBeGreaterThanOrEqual(3);
  });

  it("each category has id, label, and non-empty items", () => {
    for (const cat of useCaseCategories) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.items.length).toBeGreaterThan(0);
    }
  });

  it("each item has label, description, behaviorDisplayName, and params", () => {
    for (const cat of useCaseCategories) {
      for (const item of cat.items) {
        expect(item.label).toBeTruthy();
        expect(item.description).toBeTruthy();
        expect(item.behaviorDisplayName).toBeTruthy();
        expect(typeof item.param1).toBe("number");
        expect(typeof item.param2).toBe("number");
      }
    }
  });

  it("common-actions category exists with copy/paste/undo", () => {
    const common = useCaseCategories.find((c) => c.id === "common-actions");
    expect(common).toBeDefined();
    const labels = common!.items.map((i) => i.label);
    expect(labels).toContain("コピーする");
    expect(labels).toContain("貼り付ける");
    expect(labels).toContain("元に戻す");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/behaviors/use-cases.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/behaviors/use-cases.ts
import { hid_usage_from_page_and_id } from "../hid-usages";

export interface UseCaseItem {
  label: string;
  description: string;
  behaviorDisplayName: string;
  param1: number;
  param2: number;
}

export interface UseCaseCategory {
  id: string;
  label: string;
  items: UseCaseItem[];
}

// HID helpers
const KB = 7; // Keyboard usage page
const key = (id: number) => hid_usage_from_page_and_id(KB, id);
const ctrl = (usage: number) => (0x01 << 24) | usage;
const alt = (usage: number) => (0x04 << 24) | usage;
const gui = (usage: number) => (0x08 << 24) | usage;
const ctrlShift = (usage: number) => (0x03 << 24) | usage;

// Common HID key IDs (keyboard page)
const HID = {
  C: 6, V: 25, X: 27, Z: 29, Y: 28, A: 4, S: 22, F: 9,
  N: 17, W: 26, T: 23, L: 15, P: 19,
  Tab: 43, Enter: 40, Space: 44, Escape: 41,
  Delete: 76, Backspace: 42,
  PrintScreen: 70,
  F4: 61, F5: 62,
};

export const useCaseCategories: UseCaseCategory[] = [
  {
    id: "common-actions",
    label: "よく使う操作",
    items: [
      { label: "コピーする", description: "選択した部分を記憶する", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.C)), param2: 0 },
      { label: "貼り付ける", description: "記憶した内容をここに出す", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.V)), param2: 0 },
      { label: "切り取る", description: "選択した部分を記憶して消す", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.X)), param2: 0 },
      { label: "元に戻す", description: "直前の操作を取り消す", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.Z)), param2: 0 },
      { label: "やり直す", description: "取り消した操作をもう一度", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.Y)), param2: 0 },
      { label: "全部選択する", description: "すべてを選択状態にする", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.A)), param2: 0 },
      { label: "保存する", description: "今の状態を保存する", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.S)), param2: 0 },
      { label: "検索する", description: "文字を探す", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.F)), param2: 0 },
    ],
  },
  {
    id: "productivity",
    label: "仕事効率化",
    items: [
      { label: "ウィンドウを切り替える", description: "開いているアプリを切り替える", behaviorDisplayName: "Key Press", param1: alt(key(HID.Tab)), param2: 0 },
      { label: "スクリーンショットを撮る", description: "画面を画像として保存する", behaviorDisplayName: "Key Press", param1: gui(key(HID.PrintScreen)), param2: 0 },
      { label: "デスクトップを表示する", description: "全ウィンドウを最小化する", behaviorDisplayName: "Key Press", param1: gui(key(HID.Delete)), param2: 0 },
      { label: "タブを閉じる", description: "ブラウザやエディタのタブを閉じる", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.W)), param2: 0 },
      { label: "新しいタブを開く", description: "ブラウザやエディタで新しいタブ", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.T)), param2: 0 },
      { label: "アドレスバーに移動", description: "ブラウザのURL欄にカーソルを移す", behaviorDisplayName: "Key Press", param1: ctrl(key(HID.L)), param2: 0 },
    ],
  },
  {
    id: "layers",
    label: "レイヤーを使う",
    items: [
      { label: "押している間だけ切り替える", description: "キーを押している間だけ別のレイヤーになる。離すと戻る", behaviorDisplayName: "Momentary Layer", param1: 1, param2: 0 },
      { label: "ON/OFFで切り替える", description: "1回押すとON、もう1回押すとOFF", behaviorDisplayName: "Toggle Layer", param1: 1, param2: 0 },
      { label: "次の1キーだけ切り替える", description: "次に押す1キーだけ別レイヤーで入力する", behaviorDisplayName: "Sticky Layer", param1: 1, param2: 0 },
    ],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/behaviors/use-cases.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/behaviors/use-cases.ts src/behaviors/use-cases.test.ts
git commit -m "feat: add use case data for keymap picker"
```

---

### Task 3: Key Role Data

Define per-key roles and recommendations for thumb keys.

**Files:**
- Create: `src/keyboard/key-roles.ts`
- Create: `src/keyboard/key-roles.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/keyboard/key-roles.test.ts
import { describe, it, expect } from "vitest";
import { keyRoleMap, KeyRole } from "./key-roles";

describe("keyRoleMap", () => {
  it("is a non-empty record", () => {
    expect(Object.keys(keyRoleMap).length).toBeGreaterThan(0);
  });

  it("each role has roleLabel and non-empty recommendations", () => {
    for (const [posStr, role] of Object.entries(keyRoleMap)) {
      expect(Number.isInteger(Number(posStr))).toBe(true);
      expect(role.roleLabel).toBeTruthy();
      expect(role.recommendations.length).toBeGreaterThan(0);
    }
  });

  it("each recommendation has label, behaviorDisplayName, and params", () => {
    for (const role of Object.values(keyRoleMap)) {
      for (const rec of role.recommendations) {
        expect(rec.label).toBeTruthy();
        expect(rec.behaviorDisplayName).toBeTruthy();
        expect(typeof rec.param1).toBe("number");
        expect(typeof rec.param2).toBe("number");
      }
    }
  });

  it("getKeyRole returns role for known position", () => {
    const positions = Object.keys(keyRoleMap).map(Number);
    const firstPos = positions[0];
    expect(keyRoleMap[firstPos]).toBeDefined();
    expect(keyRoleMap[firstPos].roleLabel).toBeTruthy();
  });

  it("getKeyRole returns undefined for unknown position", () => {
    expect(keyRoleMap[9999]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/keyboard/key-roles.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Note: Key position indices depend on the physical layout. The exact indices for thumb keys must be verified against the minimal-keys physical layout definition from the connected keyboard. Use placeholder indices for now and update after verifying with the real device.

```typescript
// src/keyboard/key-roles.ts
import { hid_usage_from_page_and_id } from "../hid-usages";

export interface KeyRecommendation {
  label: string;
  description: string;
  behaviorDisplayName: string;
  param1: number;
  param2: number;
  popular?: boolean;
}

export interface KeyRole {
  roleLabel: string;
  recommendations: KeyRecommendation[];
}

export type KeyRoleMap = Record<number, KeyRole>;

const KB = 7;
const key = (id: number) => hid_usage_from_page_and_id(KB, id);

// HID key IDs
const HID = {
  Enter: 40, Space: 44, Backspace: 42, Escape: 41, Tab: 43, Delete: 76,
};

// Thumb key position indices (verify with actual minimal-keys layout)
// TODO: Confirm these indices with masakazu using the real physical layout
export const keyRoleMap: KeyRoleMap = {
  // Left thumb keys (positions TBD — using placeholders)
  37: {
    roleLabel: "左手親指・外側",
    recommendations: [
      { label: "Tab", description: "タブキー", behaviorDisplayName: "Key Press", param1: key(HID.Tab), param2: 0 },
      { label: "一時レイヤー", description: "押している間だけレイヤー切替", behaviorDisplayName: "Momentary Layer", param1: 1, param2: 0 },
    ],
  },
  38: {
    roleLabel: "左手親指・中央",
    recommendations: [
      { label: "スペース", description: "スペースキー", behaviorDisplayName: "Key Press", param1: key(HID.Space), param2: 0, popular: true },
      { label: "Enter", description: "確定・改行", behaviorDisplayName: "Key Press", param1: key(HID.Enter), param2: 0 },
    ],
  },
  39: {
    roleLabel: "左手親指・内側",
    recommendations: [
      { label: "バックスペース", description: "1文字消す", behaviorDisplayName: "Key Press", param1: key(HID.Backspace), param2: 0, popular: true },
      { label: "Delete", description: "カーソルの右側を消す", behaviorDisplayName: "Key Press", param1: key(HID.Delete), param2: 0 },
      { label: "Escape", description: "キャンセル・閉じる", behaviorDisplayName: "Key Press", param1: key(HID.Escape), param2: 0 },
    ],
  },
  // Right thumb keys (positions TBD — using placeholders)
  40: {
    roleLabel: "右手親指・内側",
    recommendations: [
      { label: "バックスペース", description: "1文字消す", behaviorDisplayName: "Key Press", param1: key(HID.Backspace), param2: 0 },
      { label: "Escape", description: "キャンセル・閉じる", behaviorDisplayName: "Key Press", param1: key(HID.Escape), param2: 0 },
    ],
  },
  41: {
    roleLabel: "右手親指・中央",
    recommendations: [
      { label: "Enter", description: "確定・改行", behaviorDisplayName: "Key Press", param1: key(HID.Enter), param2: 0, popular: true },
      { label: "スペース", description: "スペースキー", behaviorDisplayName: "Key Press", param1: key(HID.Space), param2: 0 },
    ],
  },
  42: {
    roleLabel: "右手親指・外側",
    recommendations: [
      { label: "一時レイヤー", description: "押している間だけレイヤー切替", behaviorDisplayName: "Momentary Layer", param1: 1, param2: 0, popular: true },
      { label: "レイヤー切替", description: "ON/OFFで切り替える", behaviorDisplayName: "Toggle Layer", param1: 1, param2: 0 },
    ],
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/keyboard/key-roles.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/keyboard/key-roles.ts src/keyboard/key-roles.test.ts
git commit -m "feat: add key role data for thumb key recommendations"
```

---

### Task 4: AllBehaviorsTab Component

Extract the current `<select>` + `<optgroup>` into an accordion-style list.

**Files:**
- Create: `src/behaviors/picker/AllBehaviorsTab.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// Add to src/behaviors/picker/PickerTabs.test.tsx (create file)
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllBehaviorsTab } from "./AllBehaviorsTab";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

const fakeBehaviors: GetBehaviorDetailsResponse[] = [
  { id: 1, displayName: "Key Press", metadata: [] },
  { id: 2, displayName: "Momentary Layer", metadata: [] },
  { id: 3, displayName: "Transparent", metadata: [] },
];

const fakeLayers = [{ id: 0, name: "Layer 0" }];

describe("AllBehaviorsTab", () => {
  it("renders category headers", () => {
    render(
      <AllBehaviorsTab
        behaviors={fakeBehaviors}
        layers={fakeLayers}
        selectedBehaviorId={1}
        onBehaviorSelected={() => {}}
      />
    );
    expect(screen.getByText("基本キー操作")).toBeDefined();
  });

  it("shows behavior items when category is expanded", async () => {
    const { getByText } = render(
      <AllBehaviorsTab
        behaviors={fakeBehaviors}
        layers={fakeLayers}
        selectedBehaviorId={1}
        onBehaviorSelected={() => {}}
      />
    );
    // "基本キー操作" category should show "キー入力" (Key Press)
    expect(getByText("キー入力")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/behaviors/picker/PickerTabs.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/behaviors/picker/AllBehaviorsTab.tsx
import { useMemo, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import {
  getBehaviorDescription,
  categoryLabels,
  categoryOrder,
  BehaviorCategory,
} from "../behavior-descriptions";

interface AllBehaviorsTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  selectedBehaviorId: number;
  onBehaviorSelected: (behaviorId: number) => void;
}

export function AllBehaviorsTab({
  behaviors,
  selectedBehaviorId,
  onBehaviorSelected,
}: AllBehaviorsTabProps) {
  const [expandedCategory, setExpandedCategory] = useState<BehaviorCategory | null>("basic");

  const groupedBehaviors = useMemo(() => {
    const groups = new Map<BehaviorCategory, GetBehaviorDetailsResponse[]>();
    for (const cat of categoryOrder) groups.set(cat, []);
    for (const b of behaviors) {
      const desc = getBehaviorDescription(b.displayName);
      const list = groups.get(desc.category);
      if (list) list.push(b);
      else groups.get("other")!.push(b);
    }
    for (const [, list] of groups) {
      list.sort((a, b) => {
        const da = getBehaviorDescription(a.displayName);
        const db = getBehaviorDescription(b.displayName);
        return da.label.localeCompare(db.label);
      });
    }
    return groups;
  }, [behaviors]);

  return (
    <div className="flex flex-col gap-1">
      {categoryOrder.map((cat) => {
        const list = groupedBehaviors.get(cat);
        if (!list || list.length === 0) return null;
        const isExpanded = expandedCategory === cat;
        return (
          <div key={cat}>
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-base-content/70 hover:bg-base-200 rounded"
              onClick={() => setExpandedCategory(isExpanded ? null : cat)}
            >
              <span className="text-xs">{isExpanded ? "▼" : "▶"}</span>
              {categoryLabels[cat]}
              <span className="text-xs text-base-content/40 ml-auto">{list.length}</span>
            </button>
            {isExpanded && (
              <div className="flex flex-col ml-4">
                {list.map((b) => {
                  const desc = getBehaviorDescription(b.displayName);
                  const isSelected = b.id === selectedBehaviorId;
                  return (
                    <button
                      key={b.id}
                      className={`text-left px-2 py-1 rounded text-sm hover:bg-base-200 ${
                        isSelected ? "bg-primary/10 text-primary font-medium" : ""
                      }`}
                      onClick={() => onBehaviorSelected(b.id)}
                    >
                      <span>{desc.label}</span>
                      {desc.label !== b.displayName && (
                        <span className="text-xs text-base-content/40 ml-1">({b.displayName})</span>
                      )}
                      {desc.description && (
                        <p className="text-xs text-base-content/50 leading-relaxed">{desc.description}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/behaviors/picker/PickerTabs.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/behaviors/picker/AllBehaviorsTab.tsx src/behaviors/picker/PickerTabs.test.tsx
git commit -m "feat: add AllBehaviorsTab with accordion category list"
```

---

### Task 5: UseCasesTab Component

Category sub-tabs + items list. Click to apply immediately.

**Files:**
- Create: `src/behaviors/picker/UseCasesTab.tsx`
- Modify: `src/behaviors/picker/PickerTabs.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// Append to src/behaviors/picker/PickerTabs.test.tsx
import { UseCasesTab } from "./UseCasesTab";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

const fakeBehaviorsForUseCase: GetBehaviorDetailsResponse[] = [
  { id: 10, displayName: "Key Press", metadata: [] },
  { id: 20, displayName: "Momentary Layer", metadata: [] },
];

describe("UseCasesTab", () => {
  it("renders category buttons", () => {
    render(
      <UseCasesTab
        behaviors={fakeBehaviorsForUseCase}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.getByText("よく使う操作")).toBeDefined();
    expect(screen.getByText("仕事効率化")).toBeDefined();
    expect(screen.getByText("レイヤーを使う")).toBeDefined();
  });

  it("shows items for selected category", () => {
    render(
      <UseCasesTab
        behaviors={fakeBehaviorsForUseCase}
        onApplyBinding={() => {}}
      />
    );
    // Default category shows common actions
    expect(screen.getByText("コピーする")).toBeDefined();
  });

  it("calls onApplyBinding with resolved behaviorId on item click", async () => {
    const onApply = vi.fn();
    const { getByText } = render(
      <UseCasesTab
        behaviors={fakeBehaviorsForUseCase}
        onApplyBinding={onApply}
      />
    );
    await userEvent.click(getByText("コピーする"));
    expect(onApply).toHaveBeenCalledWith({
      behaviorId: 10, // resolved from "Key Press"
      param1: expect.any(Number),
      param2: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/behaviors/picker/PickerTabs.test.tsx`
Expected: FAIL — UseCasesTab not found

- [ ] **Step 3: Write implementation**

```typescript
// src/behaviors/picker/UseCasesTab.tsx
import { useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { useCaseCategories } from "../use-cases";
import { resolveBehaviorId } from "../resolve-behavior";

interface UseCasesTabProps {
  behaviors: GetBehaviorDetailsResponse[];
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function UseCasesTab({ behaviors, onApplyBinding }: UseCasesTabProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(useCaseCategories[0]?.id);
  const selectedCategory = useCaseCategories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 flex-wrap">
        {useCaseCategories.map((cat) => (
          <button
            key={cat.id}
            className={`px-3 py-1 text-sm rounded-md transition-all ${
              selectedCategoryId === cat.id
                ? "bg-primary text-primary-content"
                : "bg-base-200 hover:bg-base-300"
            }`}
            onClick={() => setSelectedCategoryId(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>
      {selectedCategory && (
        <div className="flex flex-col gap-0.5">
          {selectedCategory.items.map((item, i) => {
            const behaviorId = resolveBehaviorId(item.behaviorDisplayName, behaviors);
            if (behaviorId === undefined) return null;
            return (
              <button
                key={i}
                className="text-left px-3 py-2 rounded hover:bg-base-200 transition-colors"
                onClick={() =>
                  onApplyBinding({
                    behaviorId,
                    param1: item.param1,
                    param2: item.param2,
                  })
                }
              >
                <span className="text-sm font-medium">{item.label}</span>
                <p className="text-xs text-base-content/50">{item.description}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/behaviors/picker/PickerTabs.test.tsx`
Expected: PASS (5 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/behaviors/picker/UseCasesTab.tsx src/behaviors/picker/PickerTabs.test.tsx
git commit -m "feat: add UseCasesTab with category sub-tabs"
```

---

### Task 6: RecommendationsTab Component

Per-key recommendation cards. Shows role label and clickable cards.

**Files:**
- Create: `src/behaviors/picker/RecommendationsTab.tsx`
- Modify: `src/behaviors/picker/PickerTabs.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// Append to src/behaviors/picker/PickerTabs.test.tsx
import { RecommendationsTab } from "./RecommendationsTab";
import { keyRoleMap } from "../../keyboard/key-roles";

describe("RecommendationsTab", () => {
  it("shows role label for known key position", () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    const role = keyRoleMap[knownPosition];
    render(
      <RecommendationsTab
        keyPosition={knownPosition}
        behaviors={fakeBehaviorsForUseCase}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.getByText(role.roleLabel)).toBeDefined();
  });

  it("shows fallback message for unknown key position", () => {
    render(
      <RecommendationsTab
        keyPosition={9999}
        behaviors={fakeBehaviorsForUseCase}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.getByText(/用途別/)).toBeDefined();
  });

  it("renders recommendation cards", () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    const role = keyRoleMap[knownPosition];
    render(
      <RecommendationsTab
        keyPosition={knownPosition}
        behaviors={fakeBehaviorsForUseCase}
        onApplyBinding={() => {}}
      />
    );
    expect(screen.getByText(role.recommendations[0].label)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/behaviors/picker/PickerTabs.test.tsx`
Expected: FAIL — RecommendationsTab not found

- [ ] **Step 3: Write implementation**

```typescript
// src/behaviors/picker/RecommendationsTab.tsx
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
        {role.recommendations.map((rec, i) => {
          const behaviorId = resolveBehaviorId(rec.behaviorDisplayName, behaviors);
          if (behaviorId === undefined) return null;
          return (
            <button
              key={i}
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/behaviors/picker/PickerTabs.test.tsx`
Expected: PASS (8 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/behaviors/picker/RecommendationsTab.tsx src/behaviors/picker/PickerTabs.test.tsx
git commit -m "feat: add RecommendationsTab with per-key suggestion cards"
```

---

### Task 7: PickerTabs Container

Tab container with switching logic. Defaults to "Recommendations" if role data exists, otherwise "Use Cases".

**Files:**
- Create: `src/behaviors/picker/PickerTabs.tsx`
- Modify: `src/behaviors/picker/PickerTabs.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// Append to src/behaviors/picker/PickerTabs.test.tsx
import { PickerTabs } from "./PickerTabs";

describe("PickerTabs", () => {
  it("renders three tab buttons", () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    render(
      <PickerTabs
        keyPosition={knownPosition}
        behaviors={fakeBehaviorsForUseCase}
        layers={[{ id: 0, name: "Layer 0" }]}
        selectedBehaviorId={10}
        onApplyBinding={() => {}}
        onBehaviorSelected={() => {}}
      />
    );
    expect(screen.getByText("おすすめ")).toBeDefined();
    expect(screen.getByText("用途別")).toBeDefined();
    expect(screen.getByText("すべて")).toBeDefined();
  });

  it("defaults to recommendations tab for key with role data", () => {
    const knownPosition = Number(Object.keys(keyRoleMap)[0]);
    const role = keyRoleMap[knownPosition];
    render(
      <PickerTabs
        keyPosition={knownPosition}
        behaviors={fakeBehaviorsForUseCase}
        layers={[{ id: 0, name: "Layer 0" }]}
        selectedBehaviorId={10}
        onApplyBinding={() => {}}
        onBehaviorSelected={() => {}}
      />
    );
    // Should show role label (only visible in recommendations tab)
    expect(screen.getByText(role.roleLabel)).toBeDefined();
  });

  it("defaults to use-cases tab for key without role data", () => {
    render(
      <PickerTabs
        keyPosition={9999}
        behaviors={fakeBehaviorsForUseCase}
        layers={[{ id: 0, name: "Layer 0" }]}
        selectedBehaviorId={10}
        onApplyBinding={() => {}}
        onBehaviorSelected={() => {}}
      />
    );
    // Should show use case categories (only visible in use-cases tab)
    expect(screen.getByText("よく使う操作")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/behaviors/picker/PickerTabs.test.tsx`
Expected: FAIL — PickerTabs not found

- [ ] **Step 3: Write implementation**

```typescript
// src/behaviors/picker/PickerTabs.tsx
import { useEffect, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { keyRoleMap } from "../../keyboard/key-roles";
import { RecommendationsTab } from "./RecommendationsTab";
import { UseCasesTab } from "./UseCasesTab";
import { AllBehaviorsTab } from "./AllBehaviorsTab";

type TabId = "recommendations" | "use-cases" | "all";

interface PickerTabsProps {
  keyPosition: number;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  selectedBehaviorId: number;
  onApplyBinding: (binding: BehaviorBinding) => void;
  onBehaviorSelected: (behaviorId: number) => void;
}

const tabs: { id: TabId; label: string }[] = [
  { id: "recommendations", label: "おすすめ" },
  { id: "use-cases", label: "用途別" },
  { id: "all", label: "すべて" },
];

export function PickerTabs({
  keyPosition,
  behaviors,
  layers,
  selectedBehaviorId,
  onApplyBinding,
  onBehaviorSelected,
}: PickerTabsProps) {
  const hasRecommendations = keyRoleMap[keyPosition] !== undefined;
  const [activeTab, setActiveTab] = useState<TabId>(
    hasRecommendations ? "recommendations" : "use-cases"
  );

  // Reset tab when key changes
  useEffect(() => {
    setActiveTab(keyRoleMap[keyPosition] ? "recommendations" : "use-cases");
  }, [keyPosition]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 border-b border-base-300 pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`px-3 py-1 text-sm rounded-t transition-all ${
              activeTab === tab.id
                ? "bg-base-100 text-primary font-medium border-b-2 border-primary"
                : "text-base-content/50 hover:text-base-content"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-[6rem]">
        {activeTab === "recommendations" && (
          <RecommendationsTab
            keyPosition={keyPosition}
            behaviors={behaviors}
            onApplyBinding={onApplyBinding}
          />
        )}
        {activeTab === "use-cases" && (
          <UseCasesTab
            behaviors={behaviors}
            onApplyBinding={onApplyBinding}
          />
        )}
        {activeTab === "all" && (
          <AllBehaviorsTab
            behaviors={behaviors}
            layers={layers}
            selectedBehaviorId={selectedBehaviorId}
            onBehaviorSelected={onBehaviorSelected}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/behaviors/picker/PickerTabs.test.tsx`
Expected: PASS (11 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/behaviors/picker/PickerTabs.tsx src/behaviors/picker/PickerTabs.test.tsx
git commit -m "feat: add PickerTabs container with 3-tab switching"
```

---

### Task 8: Integrate into BehaviorBindingPicker

Replace the `<select>` dropdown with `<PickerTabs>`. Keep `BehaviorParametersPicker` for "All" tab selections.

**Files:**
- Modify: `src/behaviors/BehaviorBindingPicker.tsx`
- Modify: `src/behaviors/picker/PickerTabs.test.tsx` (add integration test)

- [ ] **Step 1: Write failing integration test**

```typescript
// Append to src/behaviors/picker/PickerTabs.test.tsx
import { BehaviorBindingPicker } from "../BehaviorBindingPicker";

describe("BehaviorBindingPicker integration", () => {
  it("renders PickerTabs instead of select dropdown", () => {
    render(
      <BehaviorBindingPicker
        binding={{ behaviorId: 10, param1: 0, param2: 0 }}
        behaviors={fakeBehaviorsForUseCase}
        layers={[{ id: 0, name: "Layer 0" }]}
        onBindingChanged={() => {}}
        keyPosition={9999}
      />
    );
    // Should have tab buttons, not a <select>
    expect(screen.getByText("おすすめ")).toBeDefined();
    expect(screen.getByText("用途別")).toBeDefined();
    expect(screen.getByText("すべて")).toBeDefined();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/behaviors/picker/PickerTabs.test.tsx`
Expected: FAIL — BehaviorBindingPicker doesn't accept `keyPosition` prop / still renders `<select>`

- [ ] **Step 3: Modify BehaviorBindingPicker**

Replace the `<select>` with `<PickerTabs>`. Add `keyPosition` prop. Keep `BehaviorParametersPicker` for "All" tab.

```typescript
// src/behaviors/BehaviorBindingPicker.tsx — full replacement
import { useEffect, useMemo, useState } from "react";
import type {
  GetBehaviorDetailsResponse,
  BehaviorBindingParametersSet,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { BehaviorParametersPicker } from "./BehaviorParametersPicker";
import { validateValue } from "./parameters";
import { PickerTabs } from "./picker/PickerTabs";

export interface BehaviorBindingPickerProps {
  binding: BehaviorBinding;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onBindingChanged: (binding: BehaviorBinding) => void;
  keyPosition?: number;
}

function validateBinding(
  metadata: BehaviorBindingParametersSet[],
  layerIds: number[],
  param1?: number,
  param2?: number
): boolean {
  if (
    (param1 === undefined || param1 === 0) &&
    metadata.every((s) => !s.param1 || s.param1.length === 0)
  ) {
    return true;
  }
  const matchingSet = metadata.find((s) =>
    validateValue(layerIds, param1, s.param1)
  );
  if (!matchingSet) return false;
  return validateValue(layerIds, param2, matchingSet.param2);
}

export const BehaviorBindingPicker = ({
  binding,
  layers,
  behaviors,
  onBindingChanged,
  keyPosition,
}: BehaviorBindingPickerProps) => {
  const [behaviorId, setBehaviorId] = useState(binding.behaviorId);
  const [param1, setParam1] = useState<number | undefined>(binding.param1);
  const [param2, setParam2] = useState<number | undefined>(binding.param2);
  // Track whether user is in "All" tab manual mode (needs param pickers)
  const [showParamPickers, setShowParamPickers] = useState(false);

  const metadata = useMemo(
    () => behaviors.find((b) => b.id == behaviorId)?.metadata,
    [behaviorId, behaviors]
  );

  useEffect(() => {
    if (
      binding.behaviorId === behaviorId &&
      binding.param1 === param1 &&
      binding.param2 === param2
    ) {
      return;
    }
    if (!metadata) return;
    if (
      validateBinding(
        metadata,
        layers.map(({ id }) => id),
        param1,
        param2
      )
    ) {
      onBindingChanged({
        behaviorId,
        param1: param1 || 0,
        param2: param2 || 0,
      });
    }
  }, [behaviorId, param1, param2, binding.behaviorId, binding.param1, binding.param2, layers, metadata, onBindingChanged]);

  useEffect(() => {
    setBehaviorId(binding.behaviorId);
    setParam1(binding.param1);
    setParam2(binding.param2);
  }, [binding]);

  // Called by Recommendations/UseCases tabs — apply full binding directly
  const handleApplyBinding = (newBinding: BehaviorBinding) => {
    setShowParamPickers(false);
    setBehaviorId(newBinding.behaviorId);
    setParam1(newBinding.param1);
    setParam2(newBinding.param2);
  };

  // Called by All tab — select behavior, then show param pickers
  const handleBehaviorSelected = (newBehaviorId: number) => {
    setShowParamPickers(true);
    setBehaviorId(newBehaviorId);
    setParam1(0);
    setParam2(0);
  };

  return (
    <div className="flex flex-col gap-2">
      <PickerTabs
        keyPosition={keyPosition ?? -1}
        behaviors={behaviors}
        layers={layers}
        selectedBehaviorId={behaviorId}
        onApplyBinding={handleApplyBinding}
        onBehaviorSelected={handleBehaviorSelected}
      />
      {showParamPickers && metadata && (
        <BehaviorParametersPicker
          metadata={metadata}
          param1={param1}
          param2={param2}
          layers={layers}
          onParam1Changed={setParam1}
          onParam2Changed={setParam2}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 4: Update Keyboard.tsx to pass keyPosition**

In `src/keyboard/Keyboard.tsx`, the `BehaviorBindingPicker` is rendered around line 495. Add the `keyPosition` prop:

Find:
```tsx
<BehaviorBindingPicker
  binding={selectedBinding}
  behaviors={Object.values(behaviors)}
  layers={keymap.layers.map(({ id, name }, li) => ({
    id,
    name: name || li.toLocaleString(),
  }))}
  onBindingChanged={doUpdateBinding}
/>
```

Replace with:
```tsx
<BehaviorBindingPicker
  binding={selectedBinding}
  behaviors={Object.values(behaviors)}
  layers={keymap.layers.map(({ id, name }, li) => ({
    id,
    name: name || li.toLocaleString(),
  }))}
  onBindingChanged={doUpdateBinding}
  keyPosition={selectedKeyPosition}
/>
```

Note: `EncoderSettings.tsx` also uses `BehaviorBindingPicker` but without `keyPosition` — it will use the default (`-1`), which means "no recommendations". This is correct since encoder bindings don't have physical key positions.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Run lint and build**

Run: `npm run lint && npm run build`
Expected: 0 errors, 0 warnings, build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/behaviors/BehaviorBindingPicker.tsx src/keyboard/Keyboard.tsx src/behaviors/picker/PickerTabs.test.tsx
git commit -m "feat: integrate 3-tab picker into BehaviorBindingPicker"
```

---

### Task 9: Manual Verification with Real Device

Connect minimal-keys via Tauri and verify the full flow.

- [ ] **Step 1: Start Tauri dev**

Run: `npm run tauri dev`

- [ ] **Step 2: Connect keyboard via BLE**

- [ ] **Step 3: Verify key role indices**

Click each thumb key and check if "おすすめ" tab shows the correct role label. If position indices are wrong, update `src/keyboard/key-roles.ts` with correct indices. Log the `selectedKeyPosition` value in the console for each thumb key.

- [ ] **Step 4: Verify use cases**

Switch to "用途別" tab. Click "コピーする". Verify the key binding changes to Ctrl+C.

- [ ] **Step 5: Verify "All" tab**

Switch to "すべて" tab. Expand a category. Select a behavior. Verify parameter picker appears and binding changes work.

- [ ] **Step 6: Commit any index corrections**

```bash
git add src/keyboard/key-roles.ts
git commit -m "fix: correct thumb key position indices for minimal-keys layout"
```
