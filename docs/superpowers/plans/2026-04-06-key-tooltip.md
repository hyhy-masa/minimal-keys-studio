# Key Tooltip (Popover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hover-triggered popovers to all keys and the encoder, showing what each key does in plain Japanese with recommendations and a path to change settings.

**Architecture:** Data-driven tooltip system. A `resolveTooltipData` function takes a binding + key position and resolves it to display data by reverse-looking-up `use-cases.ts`, then `key-roles.ts`, then falling back to `key-descriptions.ts`. A `KeyTooltip` React component renders the popover with 3 variants (Simple, Detail, Encoder). The encoder variant loads CW/CCW bindings via a shared `useEncoderBindings` hook. Tooltip is rendered via React Portal to escape the scaled keyboard container.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest, @testing-library/react

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/keyboard/key-descriptions.ts` | HID key → Japanese role name mapping + encoder adjustable options |
| Create | `src/keyboard/key-descriptions.test.ts` | Tests for key descriptions data |
| Create | `src/keyboard/tooltip-data.ts` | Resolve binding → tooltip display data (reverse lookup) |
| Create | `src/keyboard/tooltip-data.test.ts` | Tests for tooltip data resolver |
| Create | `src/keyboard/KeyTooltip.tsx` | Popover component (Simple / Detail / Encoder variants) |
| Create | `src/keyboard/KeyTooltip.test.tsx` | Component tests for tooltip rendering |
| Create | `src/keyboard/useEncoderBindings.ts` | Hook to load encoder CW/CCW bindings via RSR |
| Modify | `src/keyboard/Key.tsx` | Add hover events, render KeyTooltip |
| Modify | `src/keyboard/Keymap.tsx` | Pass binding + behaviors to each key for tooltip |
| Modify | `src/keyboard/PhysicalLayout.tsx` | Pass binding data through to Key |

---

### Task 1: Key Descriptions Data

Japanese role names for HID keys, mouse keys, and encoder rotation options. This is the fallback data when `use-cases.ts` reverse lookup doesn't match.

**Files:**
- Create: `src/keyboard/key-descriptions.ts`
- Create: `src/keyboard/key-descriptions.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/keyboard/key-descriptions.test.ts
import { describe, it, expect } from "vitest";
import {
  getHidKeyDescription,
  getMouseKeyDescription,
  getBehaviorRoleName,
  ENCODER_POSITION,
  ENCODER_ADJUSTABLE_OPTIONS,
} from "./key-descriptions";

describe("getHidKeyDescription", () => {
  it("returns role for standard letter keys", () => {
    const desc = getHidKeyDescription(7, 4); // page 7 (Keyboard), id 4 (A)
    expect(desc.roleName).toBe("A");
    expect(desc.description).toBe("文字入力");
  });

  it("returns role for function keys", () => {
    const desc = getHidKeyDescription(7, 62); // F5
    expect(desc.roleName).toBe("F5");
    expect(desc.description).toBe("更新・再読み込み");
  });

  it("returns role for special keys", () => {
    const desc = getHidKeyDescription(7, 44); // Space
    expect(desc.roleName).toBe("スペース");
    expect(desc.description).toBe("空白を入力");
  });

  it("returns generic fallback for unknown keys", () => {
    const desc = getHidKeyDescription(7, 9999);
    expect(desc.roleName).toBeTruthy();
    expect(desc.description).toBe("キー入力");
  });
});

describe("getMouseKeyDescription", () => {
  it("returns description for left click", () => {
    // Mouse button page = 9, id 1 = left click
    const desc = getMouseKeyDescription(1);
    expect(desc.roleName).toBe("左クリック");
    expect(desc.description).toBe("選択・決定");
  });

  it("returns description for right click", () => {
    const desc = getMouseKeyDescription(2);
    expect(desc.roleName).toBe("右クリック");
    expect(desc.description).toBe("メニューを開く");
  });
});

describe("getBehaviorRoleName", () => {
  it("returns Japanese name for layer behaviors", () => {
    expect(getBehaviorRoleName("Momentary Layer")).toBe("一時レイヤー");
    expect(getBehaviorRoleName("Toggle Layer")).toBe("レイヤー切替");
  });

  it("returns Japanese name for system behaviors", () => {
    expect(getBehaviorRoleName("None")).toBe("無効");
    expect(getBehaviorRoleName("Transparent")).toBe("透過");
  });

  it("returns displayName for unknown behaviors", () => {
    expect(getBehaviorRoleName("Custom Thing")).toBe("Custom Thing");
  });
});

describe("encoder constants", () => {
  it("has encoder position defined", () => {
    expect(typeof ENCODER_POSITION).toBe("number");
  });

  it("has adjustable options", () => {
    expect(ENCODER_ADJUSTABLE_OPTIONS.length).toBeGreaterThan(0);
    expect(ENCODER_ADJUSTABLE_OPTIONS[0]).toHaveProperty("label");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/keyboard/key-descriptions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/keyboard/key-descriptions.ts
import { hid_usage_get_labels } from "../hid-usages";

export interface KeyDescription {
  roleName: string;
  description: string;
}

// Encoder is at position 0 (Q key position on left side)
// TODO: Verify with real device if needed
export const ENCODER_POSITION = 0;

export interface EncoderOption {
  label: string;
  description: string;
}

export const ENCODER_ADJUSTABLE_OPTIONS: EncoderOption[] = [
  { label: "音量", description: "音量の上げ下げ" },
  { label: "スクロール", description: "ページの上下スクロール" },
  { label: "左右スクロール", description: "ページの左右スクロール" },
  { label: "Bluetooth切替", description: "接続先の切り替え" },
];

// Special HID key descriptions (Keyboard page = 7)
const specialKeys: Record<number, KeyDescription> = {
  40: { roleName: "Enter", description: "確定・改行" },
  41: { roleName: "Escape", description: "キャンセル・閉じる" },
  42: { roleName: "バックスペース", description: "1文字消す" },
  43: { roleName: "Tab", description: "タブ・次の項目へ" },
  44: { roleName: "スペース", description: "空白を入力" },
  57: { roleName: "Caps Lock", description: "大文字固定" },
  58: { roleName: "F1", description: "ヘルプを開く" },
  59: { roleName: "F2", description: "名前の変更" },
  60: { roleName: "F3", description: "検索" },
  61: { roleName: "F4", description: "アドレスバー" },
  62: { roleName: "F5", description: "更新・再読み込み" },
  63: { roleName: "F6", description: "アドレスバーに移動" },
  64: { roleName: "F7", description: "F7" },
  65: { roleName: "F8", description: "F8" },
  66: { roleName: "F9", description: "F9" },
  67: { roleName: "F10", description: "メニューバー" },
  68: { roleName: "F11", description: "全画面切替" },
  69: { roleName: "F12", description: "開発者ツール" },
  70: { roleName: "PrintScreen", description: "画面キャプチャ" },
  73: { roleName: "Insert", description: "挿入モード切替" },
  74: { roleName: "Home", description: "行の先頭へ" },
  75: { roleName: "Page Up", description: "1ページ上へ" },
  76: { roleName: "Delete", description: "カーソルの右を消す" },
  77: { roleName: "End", description: "行の末尾へ" },
  78: { roleName: "Page Down", description: "1ページ下へ" },
  79: { roleName: "→", description: "右に移動" },
  80: { roleName: "←", description: "左に移動" },
  81: { roleName: "↓", description: "下に移動" },
  82: { roleName: "↑", description: "上に移動" },
};

// Letter keys: A=4 to Z=29
function isLetterKey(id: number): boolean {
  return id >= 4 && id <= 29;
}

// Number keys: 1=30 to 0=39
function isNumberKey(id: number): boolean {
  return id >= 30 && id <= 39;
}

export function getHidKeyDescription(page: number, id: number): KeyDescription {
  if (page === 7) {
    // Known special keys
    if (specialKeys[id]) return specialKeys[id];

    // Letter keys
    if (isLetterKey(id)) {
      const labels = hid_usage_get_labels(page, id);
      const name = labels.short?.replace(/^Keyboard /, "") || String.fromCharCode(65 + id - 4);
      return { roleName: name, description: "文字入力" };
    }

    // Number keys
    if (isNumberKey(id)) {
      const num = id === 39 ? "0" : String(id - 29);
      return { roleName: num, description: "数字入力" };
    }
  }

  // Generic fallback using HID labels
  const labels = hid_usage_get_labels(page, id);
  const name = labels.short?.replace(/^Keyboard /, "") || `Key ${id}`;
  return { roleName: name, description: "キー入力" };
}

// Mouse button descriptions
const mouseButtons: Record<number, KeyDescription> = {
  1: { roleName: "左クリック", description: "選択・決定" },
  2: { roleName: "右クリック", description: "メニューを開く" },
  3: { roleName: "中クリック", description: "新しいタブで開く" },
  4: { roleName: "戻る", description: "前のページへ戻る" },
  5: { roleName: "進む", description: "次のページへ進む" },
};

export function getMouseKeyDescription(buttonId: number): KeyDescription {
  return mouseButtons[buttonId] ?? { roleName: `マウスボタン${buttonId}`, description: "マウス操作" };
}

// Behavior displayName → Japanese role name (for non-Key-Press behaviors)
const behaviorRoleNames: Record<string, string> = {
  "Momentary Layer": "一時レイヤー",
  "Toggle Layer": "レイヤー切替",
  "Sticky Layer": "ワンショットレイヤー",
  "To Layer": "レイヤー移動",
  "Conditional Layer": "条件付きレイヤー",
  "Layer-Tap": "レイヤー/タップ",
  "Mod-Tap": "修飾キー/タップ",
  "Hold-Tap": "長押し/タップ",
  "Key Toggle": "キー固定",
  "Key Repeat": "キーリピート",
  "Sticky Key": "ワンショット修飾",
  "Caps Word": "Caps Word",
  "Grave/Escape": "Grave/Escape",
  Bluetooth: "Bluetooth操作",
  "Output Selection": "出力切替",
  "BLE Management": "BLE管理",
  Transparent: "透過",
  None: "無効",
  Bootloader: "ブートローダー",
  Reset: "リセット",
  "Soft Off": "電源OFF",
  "Mouse Key Press": "マウスキー",
  Macro: "マクロ",
};

export function getBehaviorRoleName(displayName: string): string {
  return behaviorRoleNames[displayName] ?? displayName;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/keyboard/key-descriptions.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/keyboard/key-descriptions.ts src/keyboard/key-descriptions.test.ts
git commit -m "feat: add key descriptions data for tooltip display"
```

---

### Task 2: Tooltip Data Resolver

Resolves a binding + key position into tooltip display data by reverse-looking-up use-cases, then key-roles, then key-descriptions.

**Files:**
- Create: `src/keyboard/tooltip-data.ts`
- Create: `src/keyboard/tooltip-data.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/keyboard/tooltip-data.test.ts
import { describe, it, expect } from "vitest";
import { resolveTooltipData, TooltipType } from "./tooltip-data";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { hid_usage_from_page_and_id } from "../hid-usages";
import { ENCODER_POSITION } from "./key-descriptions";

const KB = 7;
const key = (id: number) => hid_usage_from_page_and_id(KB, id);
const ctrl = (usage: number) => (0x01 << 24) | usage;
const gui = (usage: number) => (0x08 << 24) | usage;

const fakeBehaviors: GetBehaviorDetailsResponse[] = [
  { id: 1, displayName: "Key Press", metadata: [] },
  { id: 2, displayName: "Momentary Layer", metadata: [] },
  { id: 3, displayName: "None", metadata: [] },
  { id: 4, displayName: "Mouse Key Press", metadata: [] },
  { id: 5, displayName: "Layer-Tap", metadata: [] },
  { id: 6, displayName: "Transparent", metadata: [] },
];

describe("resolveTooltipData", () => {
  it("resolves letter key to simple tooltip", () => {
    const binding: BehaviorBinding = { behaviorId: 1, param1: key(4), param2: 0 }; // A
    const result = resolveTooltipData(binding, fakeBehaviors, 10, "mac");
    expect(result.type).toBe("simple" satisfies TooltipType);
    expect(result.roleName).toBe("A");
    expect(result.description).toBe("文字入力");
  });

  it("resolves Ctrl+C to use case match (copy)", () => {
    const binding: BehaviorBinding = { behaviorId: 1, param1: gui(key(6)), param2: 0 }; // Cmd+C
    const result = resolveTooltipData(binding, fakeBehaviors, 10, "mac");
    expect(result.roleName).toBe("コピーする");
    expect(result.description).toContain("記憶");
    expect(result.type).toBe("detail" satisfies TooltipType);
  });

  it("resolves thumb key with recommendations", () => {
    const binding: BehaviorBinding = { behaviorId: 1, param1: key(44), param2: 0 }; // Space
    const result = resolveTooltipData(binding, fakeBehaviors, 38, "mac"); // left thumb center
    expect(result.type).toBe("detail" satisfies TooltipType);
    expect(result.recommendations).toBeDefined();
    expect(result.recommendations!.length).toBeGreaterThan(0);
  });

  it("resolves layer behavior with description", () => {
    const binding: BehaviorBinding = { behaviorId: 2, param1: 1, param2: 0 };
    const result = resolveTooltipData(binding, fakeBehaviors, 15, "mac");
    expect(result.roleName).toBe("一時レイヤー");
    expect(result.description).toBeTruthy();
    expect(result.type).toBe("detail" satisfies TooltipType);
  });

  it("resolves None binding", () => {
    const binding: BehaviorBinding = { behaviorId: 3, param1: 0, param2: 0 };
    const result = resolveTooltipData(binding, fakeBehaviors, 15, "mac");
    expect(result.roleName).toBe("無効");
    expect(result.description).toContain("何も起きません");
  });

  it("resolves encoder position", () => {
    const binding: BehaviorBinding = { behaviorId: 1, param1: key(20), param2: 0 }; // Q
    const result = resolveTooltipData(binding, fakeBehaviors, ENCODER_POSITION, "mac");
    expect(result.type).toBe("encoder" satisfies TooltipType);
    expect(result.isEncoder).toBe(true);
  });

  it("resolves Transparent binding", () => {
    const binding: BehaviorBinding = { behaviorId: 6, param1: 0, param2: 0 };
    const result = resolveTooltipData(binding, fakeBehaviors, 10, "mac");
    expect(result.roleName).toBe("透過");
    expect(result.description).toContain("下のレイヤー");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/keyboard/tooltip-data.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/keyboard/tooltip-data.ts
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { hid_usage_page_and_id_from_usage } from "../hid-usages";
import { getUseCaseCategories, type UserOS } from "../behaviors/use-cases";
import { getBehaviorDescription } from "../behaviors/behavior-descriptions";
import { keyRoleMap, type KeyRecommendation } from "./key-roles";
import {
  getHidKeyDescription,
  getMouseKeyDescription,
  getBehaviorRoleName,
  ENCODER_POSITION,
  ENCODER_ADJUSTABLE_OPTIONS,
  type EncoderOption,
} from "./key-descriptions";

export type TooltipType = "simple" | "detail" | "encoder";

export interface TooltipData {
  type: TooltipType;
  roleName: string;
  description?: string;
  recommendations?: KeyRecommendation[];
  isEncoder?: boolean;
  encoderOptions?: EncoderOption[];
}

export function resolveTooltipData(
  binding: BehaviorBinding,
  behaviors: GetBehaviorDetailsResponse[],
  keyPosition: number,
  os: UserOS,
): TooltipData {
  const behavior = behaviors.find((b) => b.id === binding.behaviorId);
  const displayName = behavior?.displayName ?? "";

  // Encoder position — always show encoder tooltip
  if (keyPosition === ENCODER_POSITION) {
    const pressDesc = resolveBindingLabel(binding, behaviors, displayName, os);
    return {
      type: "encoder",
      roleName: pressDesc.roleName,
      description: pressDesc.description,
      isEncoder: true,
      encoderOptions: ENCODER_ADJUSTABLE_OPTIONS,
    };
  }

  // None — special message
  if (displayName === "None") {
    return {
      type: "detail",
      roleName: "無効",
      description: "キーを押しても何も起きません",
      recommendations: keyRoleMap[keyPosition]?.recommendations,
    };
  }

  // Transparent — special message
  if (displayName === "Transparent") {
    return {
      type: "detail",
      roleName: "透過",
      description: "下のレイヤーの設定をそのまま使います",
    };
  }

  // Non-Key-Press behaviors (layer, hold-tap, etc.) — detail with behavior description
  if (displayName !== "Key Press" && displayName !== "Mouse Key Press") {
    const desc = getBehaviorDescription(displayName);
    return {
      type: "detail",
      roleName: getBehaviorRoleName(displayName),
      description: desc.description,
      recommendations: keyRoleMap[keyPosition]?.recommendations,
    };
  }

  // Mouse Key Press
  if (displayName === "Mouse Key Press") {
    const mouseDesc = getMouseKeyDescription(binding.param1);
    return {
      type: "detail",
      roleName: mouseDesc.roleName,
      description: mouseDesc.description,
      recommendations: keyRoleMap[keyPosition]?.recommendations,
    };
  }

  // Key Press — try reverse lookup from use-cases, then key-descriptions
  const resolved = resolveBindingLabel(binding, behaviors, displayName, os);
  const role = keyRoleMap[keyPosition];

  // Has use-case match or recommendations → detail
  if (resolved.fromUseCase || role) {
    return {
      type: "detail",
      roleName: resolved.roleName,
      description: resolved.description,
      recommendations: role?.recommendations,
    };
  }

  // Simple letter/number key
  return {
    type: "simple",
    roleName: resolved.roleName,
    description: resolved.description,
  };
}

interface ResolvedLabel {
  roleName: string;
  description?: string;
  fromUseCase: boolean;
}

function resolveBindingLabel(
  binding: BehaviorBinding,
  behaviors: GetBehaviorDetailsResponse[],
  displayName: string,
  os: UserOS,
): ResolvedLabel {
  // Try use-cases reverse lookup (match on param1 for Key Press)
  if (displayName === "Key Press") {
    const categories = getUseCaseCategories(os);
    for (const category of categories) {
      for (const item of category.items) {
        if (item.behaviorDisplayName === "Key Press" && item.param1 === binding.param1) {
          return { roleName: item.label, description: item.description, fromUseCase: true };
        }
      }
    }

    // Fallback to key-descriptions
    const [rawPage, id] = hid_usage_page_and_id_from_usage(binding.param1);
    const page = rawPage & 0xff;
    const desc = getHidKeyDescription(page, id);

    // Add modifier prefix to roleName if present
    const modFlags = rawPage >> 8;
    if (modFlags) {
      const parts: string[] = [];
      if (modFlags & 0x01) parts.push("Ctrl");
      if (modFlags & 0x02) parts.push("Shift");
      if (modFlags & 0x04) parts.push("Alt");
      if (modFlags & 0x08) parts.push("⌘");
      const prefix = parts.join("+") + "+";
      return {
        roleName: prefix + desc.roleName,
        description: desc.description,
        fromUseCase: false,
      };
    }

    return { roleName: desc.roleName, description: desc.description, fromUseCase: false };
  }

  // Non-key-press fallback
  const desc = getBehaviorDescription(displayName);
  return { roleName: desc.label, description: desc.description, fromUseCase: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/keyboard/tooltip-data.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/keyboard/tooltip-data.ts src/keyboard/tooltip-data.test.ts
git commit -m "feat: add tooltip data resolver with reverse lookup"
```

---

### Task 3: KeyTooltip Component

Popover component with 3 variants: Simple (letter keys), Detail (special keys + recommendations), Encoder.

**Files:**
- Create: `src/keyboard/KeyTooltip.tsx`
- Create: `src/keyboard/KeyTooltip.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/keyboard/KeyTooltip.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeyTooltip } from "./KeyTooltip";
import type { TooltipData } from "./tooltip-data";

describe("KeyTooltip", () => {
  it("renders simple tooltip with role name", () => {
    const data: TooltipData = {
      type: "simple",
      roleName: "A",
      description: "文字入力",
    };
    render(
      <KeyTooltip data={data} anchorRect={{ top: 100, left: 100, width: 48, height: 48 }} />
    );
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("文字入力")).toBeTruthy();
  });

  it("renders detail tooltip with description and recommendations", () => {
    const data: TooltipData = {
      type: "detail",
      roleName: "コピーする",
      description: "選択した部分を記憶する",
      recommendations: [
        { label: "貼り付け", description: "記憶を出す", behaviorDisplayName: "Key Press", param1: 0, param2: 0 },
        { label: "元に戻す", description: "取り消す", behaviorDisplayName: "Key Press", param1: 0, param2: 0 },
      ],
    };
    render(
      <KeyTooltip
        data={data}
        anchorRect={{ top: 100, left: 100, width: 48, height: 48 }}
        onRecommendationClick={() => {}}
        onMoreClick={() => {}}
      />
    );
    expect(screen.getByText("コピーする")).toBeTruthy();
    expect(screen.getByText("選択した部分を記憶する")).toBeTruthy();
    expect(screen.getByText("貼り付け")).toBeTruthy();
    expect(screen.getByText("もっと見る →")).toBeTruthy();
  });

  it("renders encoder tooltip with press and rotation info", () => {
    const data: TooltipData = {
      type: "encoder",
      roleName: "Q",
      description: "文字入力",
      isEncoder: true,
      encoderOptions: [
        { label: "音量", description: "音量の上げ下げ" },
        { label: "スクロール", description: "上下スクロール" },
      ],
    };
    render(
      <KeyTooltip
        data={data}
        anchorRect={{ top: 100, left: 100, width: 48, height: 48 }}
        encoderRotationLabel="音量調整"
        onEncoderPressSettingClick={() => {}}
        onEncoderRotationSettingClick={() => {}}
      />
    );
    expect(screen.getByText(/ロータリーエンコーダ/)).toBeTruthy();
    expect(screen.getByText(/音量調整/)).toBeTruthy();
    expect(screen.getByText(/Q/)).toBeTruthy();
  });

  it("does not render when data is null", () => {
    const { container } = render(
      <KeyTooltip data={null} anchorRect={{ top: 0, left: 0, width: 0, height: 0 }} />
    );
    expect(container.innerHTML).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/keyboard/KeyTooltip.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```tsx
// src/keyboard/KeyTooltip.tsx
import { createPortal } from "react-dom";
import type { TooltipData } from "./tooltip-data";
import type { KeyRecommendation } from "./key-roles";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface KeyTooltipProps {
  data: TooltipData | null;
  anchorRect: AnchorRect;
  encoderRotationLabel?: string;
  onRecommendationClick?: (rec: KeyRecommendation) => void;
  onMoreClick?: () => void;
  onEncoderPressSettingClick?: () => void;
  onEncoderRotationSettingClick?: () => void;
}

export function KeyTooltip({
  data,
  anchorRect,
  encoderRotationLabel,
  onRecommendationClick,
  onMoreClick,
  onEncoderPressSettingClick,
  onEncoderRotationSettingClick,
}: KeyTooltipProps) {
  if (!data) return null;

  // Position above the key, centered horizontally
  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    left: anchorRect.left + anchorRect.width / 2,
    top: anchorRect.top - 8,
    transform: "translate(-50%, -100%)",
    zIndex: 50,
  };

  const content = (() => {
    switch (data.type) {
      case "simple":
        return <SimpleTooltip data={data} />;
      case "detail":
        return (
          <DetailTooltip
            data={data}
            onRecommendationClick={onRecommendationClick}
            onMoreClick={onMoreClick}
          />
        );
      case "encoder":
        return (
          <EncoderTooltip
            data={data}
            rotationLabel={encoderRotationLabel}
            onPressSettingClick={onEncoderPressSettingClick}
            onRotationSettingClick={onEncoderRotationSettingClick}
          />
        );
    }
  })();

  return createPortal(
    <div
      style={tooltipStyle}
      className="pointer-events-auto"
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <div className="bg-base-100 border border-base-300 rounded-lg shadow-lg text-sm max-w-xs">
        {content}
      </div>
    </div>,
    document.body
  );
}

function SimpleTooltip({ data }: { data: TooltipData }) {
  return (
    <div className="px-3 py-2 flex items-center gap-2">
      <span className="font-medium">{data.roleName}</span>
      {data.description && (
        <>
          <span className="text-base-content/30">—</span>
          <span className="text-base-content/70">{data.description}</span>
        </>
      )}
    </div>
  );
}

function DetailTooltip({
  data,
  onRecommendationClick,
  onMoreClick,
}: {
  data: TooltipData;
  onRecommendationClick?: (rec: KeyRecommendation) => void;
  onMoreClick?: () => void;
}) {
  return (
    <div className="px-3 py-2 flex flex-col gap-1.5">
      <div>
        <div className="font-medium">{data.roleName}</div>
        {data.description && (
          <div className="text-xs text-base-content/70">{data.description}</div>
        )}
      </div>
      {data.recommendations && data.recommendations.length > 0 && (
        <>
          <div className="border-t border-base-300" />
          <div className="flex flex-col gap-1">
            <div className="text-xs text-base-content/50">おすすめ</div>
            <div className="flex gap-1 flex-wrap">
              {data.recommendations.slice(0, 3).map((rec) => (
                <button
                  key={rec.label}
                  className="px-2 py-0.5 rounded bg-base-200 hover:bg-primary hover:text-primary-content text-xs transition-colors"
                  onClick={() => onRecommendationClick?.(rec)}
                >
                  {rec.label}
                </button>
              ))}
            </div>
            <button
              className="text-xs text-primary hover:underline text-left"
              onClick={onMoreClick}
            >
              もっと見る →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EncoderTooltip({
  data,
  rotationLabel,
  onPressSettingClick,
  onRotationSettingClick,
}: {
  data: TooltipData;
  rotationLabel?: string;
  onPressSettingClick?: () => void;
  onRotationSettingClick?: () => void;
}) {
  return (
    <div className="px-3 py-2 flex flex-col gap-1.5">
      <div className="font-medium">🎛 ロータリーエンコーダ</div>
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span>
            <span className="text-base-content/50">回す: </span>
            {rotationLabel ?? "未設定"}
          </span>
          <button
            className="text-primary hover:underline whitespace-nowrap"
            onClick={onRotationSettingClick}
          >
            設定→
          </button>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>
            <span className="text-base-content/50">押す: </span>
            {data.roleName}
          </span>
          <button
            className="text-primary hover:underline whitespace-nowrap"
            onClick={onPressSettingClick}
          >
            設定→
          </button>
        </div>
      </div>
      {data.encoderOptions && data.encoderOptions.length > 0 && (
        <>
          <div className="border-t border-base-300" />
          <div className="text-xs">
            <div className="text-base-content/50 mb-0.5">回すで調整できること:</div>
            <div className="text-base-content/70">
              {data.encoderOptions.map((opt) => opt.label).join(" / ")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/keyboard/KeyTooltip.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/keyboard/KeyTooltip.tsx src/keyboard/KeyTooltip.test.tsx
git commit -m "feat: add KeyTooltip popover component with 3 variants"
```

---

### Task 4: Encoder Bindings Hook

Shared hook to load encoder CW/CCW bindings via RSR subsystem for tooltip display.

**Files:**
- Create: `src/keyboard/useEncoderBindings.ts`

- [ ] **Step 1: Write implementation**

Note: This hook uses the RSR custom subsystem and has side effects (RPC calls). Testing it with unit tests requires mocking the subsystem, which is complex and low-value. The hook reuses existing RSR functions from `src/proto/rsr.ts` that are already tested via integration. We test this via manual verification in Task 6.

```typescript
// src/keyboard/useEncoderBindings.ts
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useCustomSubsystem } from "../rpc/useCustomSubsystem";
import * as RSR from "../proto/rsr";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { getBehaviorDescription } from "../behaviors/behavior-descriptions";

export interface EncoderBindingSummary {
  cwLabel: string;
  ccwLabel: string;
  rotationLabel: string; // Combined label like "音量調整"
}

export function useEncoderBindings(
  behaviors: GetBehaviorDetailsResponse[],
  selectedLayer: number,
): EncoderBindingSummary | null {
  const subsystem = useCustomSubsystem(RSR.SUBSYSTEM_ID);
  const lockState = useContext(LockStateContext);
  const [summary, setSummary] = useState<EncoderBindingSummary | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    if (
      !subsystem ||
      lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED ||
      behaviors.length === 0
    ) {
      setSummary(null);
      return;
    }

    const version = ++versionRef.current;

    async function load() {
      try {
        // Discover sensors first
        const sensorsResp = await subsystem!.callRPC(RSR.encodeGetSensors());
        const decoded = RSR.decodeResponse(sensorsResp);
        if (version !== versionRef.current) return;

        const sensors = decoded.getSensors?.sensors ?? [];
        if (sensors.length === 0) return;

        // Load bindings for the first sensor
        const bindResp = await subsystem!.callRPC(
          RSR.encodeGetAllLayerBindings(sensors[0].index)
        );
        const bindDecoded = RSR.decodeResponse(bindResp);
        if (version !== versionRef.current) return;

        const layerBindings = bindDecoded.getAllLayerBindings?.bindings ?? [];
        const lb = layerBindings.find((b) => b.layer === selectedLayer);

        if (lb) {
          const cwBehavior = lb.cwBinding
            ? behaviors.find((b) => b.id === lb.cwBinding!.behaviorId)
            : null;
          const ccwBehavior = lb.ccwBinding
            ? behaviors.find((b) => b.id === lb.ccwBinding!.behaviorId)
            : null;

          const cwDesc = cwBehavior
            ? getBehaviorDescription(cwBehavior.displayName)
            : null;
          const ccwDesc = ccwBehavior
            ? getBehaviorDescription(ccwBehavior.displayName)
            : null;

          const cwLabel = cwDesc?.label ?? "未設定";
          const ccwLabel = ccwDesc?.label ?? "未設定";

          // Derive rotation label: if CW and CCW are both key presses, show a combined label
          const rotationLabel = deriveRotationLabel(cwLabel, ccwLabel);

          setSummary({ cwLabel, ccwLabel, rotationLabel });
        }
      } catch (e) {
        console.debug("[useEncoderBindings] Failed to load:", e);
      }
    }

    load();
    return () => { versionRef.current++; };
  }, [subsystem, lockState, behaviors, selectedLayer]);

  return summary;
}

function deriveRotationLabel(cwLabel: string, ccwLabel: string): string {
  // Try to find a common theme
  if (cwLabel.includes("音量") || ccwLabel.includes("音量")) return "音量調整";
  if (cwLabel.includes("スクロール") || ccwLabel.includes("スクロール")) return "スクロール";
  if (cwLabel.includes("Bluetooth") || ccwLabel.includes("Bluetooth")) return "Bluetooth切替";
  return `${cwLabel} / ${ccwLabel}`;
}
```

- [ ] **Step 2: Run all existing tests to confirm no breakage**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/keyboard/useEncoderBindings.ts
git commit -m "feat: add useEncoderBindings hook for encoder tooltip data"
```

---

### Task 5: Integrate Tooltip into Keyboard View

Wire up hover events in Key, pass binding data through Keymap and PhysicalLayout, and render KeyTooltip.

**Files:**
- Modify: `src/keyboard/PhysicalLayout.tsx`
- Modify: `src/keyboard/Keymap.tsx`
- Modify: `src/keyboard/Key.tsx`
- Modify: `src/keyboard/Keyboard.tsx`

- [ ] **Step 1: Add binding data to KeyPosition in PhysicalLayout.tsx**

In `src/keyboard/PhysicalLayout.tsx`, add optional tooltip-related props to `KeyPosition`:

```typescript
// Add to the KeyPosition type (line 10)
export type KeyPosition = PropsWithChildren<{
  id: string;
  header?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  r?: number;
  rx?: number;
  ry?: number;
  tooltipData?: import("./tooltip-data").TooltipData | null;
}>;
```

Pass `tooltipData` through to `Key` (around line 134):

```tsx
// Replace the key rendering block (lines 127-141)
const positionItems = positions.map((p, idx) => (
  <div className="absolute" style={scalePosition(p, oneU)}>
    <div
      key={p.id}
      onClick={() => onPositionClicked?.(idx)}
      className="hover:[transform:translateZ(100px)] transition-transform duration-200"
    >
      <Key
        oneU={oneU}
        selected={idx === selectedPosition}
        tooltipData={p.tooltipData}
        onRecommendationClick={onRecommendationApply}
        onMoreClick={() => onPositionClicked?.(idx)}
        {...p}
      />
    </div>
  </div>
));
```

Add `onRecommendationApply` to `PhysicalLayoutProps`:

```typescript
interface PhysicalLayoutProps {
  positions: Array<KeyPosition>;
  selectedPosition?: number;
  oneU?: number;
  hoverZoom?: boolean;
  zoom?: LayoutZoom;
  onPositionClicked?: (position: number) => void;
  onRecommendationApply?: (binding: import("@zmkfirmware/zmk-studio-ts-client/keymap").BehaviorBinding) => void;
}
```

- [ ] **Step 2: Add hover state and tooltip rendering in Key.tsx**

Replace `src/keyboard/Key.tsx`:

```tsx
import { PropsWithChildren, useCallback, useRef, useState } from "react";
import BehaviorShortNames from "./behavior-short-names.json";
import { KeyTooltip } from "./KeyTooltip";
import type { TooltipData } from "./tooltip-data";
import type { KeyRecommendation } from "./key-roles";
import { resolveBehaviorId } from "../behaviors/resolve-behavior";

interface KeyProps {
  selected?: boolean;
  width: number;
  height: number;
  oneU: number;
  header?: string;
  onClick?: () => void;
  tooltipData?: TooltipData | null;
  onRecommendationClick?: (binding: { behaviorId: number; param1: number; param2: number }) => void;
  onMoreClick?: () => void;
}

interface BehaviorShortName {
  short?: string;
}

const MAX_HEADER_LENGTH = 9;
const shortNames: Record<string, BehaviorShortName> = BehaviorShortNames;
const HOVER_DELAY_MS = 200;

const shortenHeader = (header: string | undefined) => {
  if (typeof header === "undefined") {
    return "";
  }
  if (typeof shortNames[header]?.short !== "undefined") {
    return shortNames[header].short;
  } else if (header.length > MAX_HEADER_LENGTH) {
    const words = header.split(/[\s,-]+/);
    const lettersPerWord = Math.trunc(MAX_HEADER_LENGTH / words.length);
    return words.map((word) => word.substring(0, lettersPerWord)).join("");
  } else {
    return header;
  }
};

export const Key = ({
  selected = false,
  width,
  height,
  oneU,
  header,
  onClick,
  tooltipData,
  onRecommendationClick,
  onMoreClick,
  children,
}: PropsWithChildren<KeyProps>) => {
  const pixelWidth = width * oneU - 2;
  const pixelHeight = height * oneU - 2;
  const radius = Math.max(4, oneU * 0.08);

  const [showTooltip, setShowTooltip] = useState(false);
  const [anchorRect, setAnchorRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setAnchorRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      }
      setShowTooltip(true);
    }, HOVER_DELAY_MS);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowTooltip(false);
  }, []);

  const handleClick = useCallback(() => {
    setShowTooltip(false);
    onClick?.();
  }, [onClick]);

  return (
    <>
      <button
        ref={buttonRef}
        className={`keycap group relative flex flex-col justify-center items-center cursor-pointer transition-all duration-150 text-sm border ${
          selected
            ? "bg-primary text-primary-content border-primary/30 shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.25),0_1px_2px_rgba(0,0,0,0.2)] scale-[0.97]"
            : "bg-base-100 text-base-content border-base-300/60 shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.12),0_3px_8px_rgba(0,0,0,0.12)] hover:scale-105 hover:-translate-y-0.5"
        }`}
        style={{
          width: `${pixelWidth}px`,
          height: `${pixelHeight}px`,
          fontSize: `${Math.max(10, oneU * 0.17)}px`,
          borderRadius: `${radius}px`,
          overflow: "hidden",
        }}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={`absolute ${selected ? "text-primary-content" : "text-base-content"} opacity-70 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center`}
          style={{ fontSize: `${Math.max(10, oneU * 0.18)}px` }}
        >
          {shortenHeader(header)}
        </div>
        {children}
      </button>
      {showTooltip && !selected && tooltipData && (
        <KeyTooltip
          data={tooltipData}
          anchorRect={anchorRect}
          onRecommendationClick={(rec) => {
            // We need to resolve behaviorDisplayName to behaviorId at this level
            // This is handled by the parent via onRecommendationClick
            onRecommendationClick?.({
              behaviorId: 0, // placeholder — parent resolves
              param1: rec.param1,
              param2: rec.param2,
            });
          }}
          onMoreClick={() => {
            setShowTooltip(false);
            onMoreClick?.();
          }}
        />
      )}
    </>
  );
};
```

- [ ] **Step 3: Pass tooltip data in Keymap.tsx**

Replace `src/keyboard/Keymap.tsx`:

```tsx
import {
  PhysicalLayout,
  Keymap as KeymapMsg,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "./PhysicalLayout";
import { HidUsageLabel } from "./HidUsageLabel";
import { resolveTooltipData } from "./tooltip-data";
import { detectOS } from "../behaviors/use-cases";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

export interface KeymapProps {
  layout: PhysicalLayout;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  onKeyPositionClicked: (keyPosition: number) => void;
  onBindingApply?: (binding: BehaviorBinding) => void;
}

export const Keymap = ({
  layout,
  keymap,
  behaviors,
  scale,
  selectedLayerIndex,
  selectedKeyPosition,
  onKeyPositionClicked,
  onBindingApply,
}: KeymapProps) => {
  if (!keymap.layers[selectedLayerIndex]) {
    return <></>;
  }

  const behaviorList = Object.values(behaviors);
  const os = detectOS();

  const positions = layout.keys.map((k, i) => {
    if (i >= keymap.layers[selectedLayerIndex].bindings.length) {
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: "Unknown",
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        children: <span></span>,
        tooltipData: null,
      };
    }

    const binding = keymap.layers[selectedLayerIndex].bindings[i];

    return {
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header:
        behaviors[binding.behaviorId]?.displayName || "Unknown",
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children: (
        <HidUsageLabel
          hid_usage={binding.param1}
        />
      ),
      tooltipData: resolveTooltipData(binding, behaviorList, i, os),
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      oneU={48}
      hoverZoom={true}
      zoom={scale}
      selectedPosition={selectedKeyPosition}
      onPositionClicked={onKeyPositionClicked}
      onRecommendationApply={onBindingApply}
    />
  );
};
```

- [ ] **Step 4: Wire up onBindingApply in Keyboard.tsx**

In `src/keyboard/Keyboard.tsx`, add `onBindingApply` to the `KeymapComp` call (around line 465):

Find:
```tsx
<KeymapComp
  keymap={keymap}
  layout={layouts[selectedPhysicalLayoutIndex]}
  behaviors={behaviors}
  scale={keymapScale}
  selectedLayerIndex={selectedLayerIndex}
  selectedKeyPosition={selectedKeyPosition}
  onKeyPositionClicked={setSelectedKeyPosition}
/>
```

Replace:
```tsx
<KeymapComp
  keymap={keymap}
  layout={layouts[selectedPhysicalLayoutIndex]}
  behaviors={behaviors}
  scale={keymapScale}
  selectedLayerIndex={selectedLayerIndex}
  selectedKeyPosition={selectedKeyPosition}
  onKeyPositionClicked={setSelectedKeyPosition}
  onBindingApply={doUpdateBinding}
/>
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Run lint and build**

Run: `npm run lint && npm run build`
Expected: 0 errors, 0 warnings, build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/keyboard/Key.tsx src/keyboard/Keymap.tsx src/keyboard/PhysicalLayout.tsx src/keyboard/Keyboard.tsx
git commit -m "feat: integrate key tooltip popover into keyboard view"
```

---

### Task 6: Encoder Tooltip Integration

Wire the `useEncoderBindings` hook into Keyboard.tsx and pass data to the encoder key's tooltip.

**Files:**
- Modify: `src/keyboard/Keyboard.tsx`
- Modify: `src/keyboard/Keymap.tsx`

- [ ] **Step 1: Add encoder bindings to Keyboard.tsx**

In `src/keyboard/Keyboard.tsx`, add the hook and pass data to Keymap:

After the existing imports (around line 32), add:

```typescript
import { useEncoderBindings } from "./useEncoderBindings";
```

Inside the `Keyboard` function, after the `useMemo` for `selectedBinding` (around line 234), add:

```typescript
const encoderSummary = useEncoderBindings(
  behaviors ? Object.values(behaviors) : [],
  selectedLayerIndex,
);
```

Update the `KeymapComp` call to pass encoder data:

```tsx
<KeymapComp
  keymap={keymap}
  layout={layouts[selectedPhysicalLayoutIndex]}
  behaviors={behaviors}
  scale={keymapScale}
  selectedLayerIndex={selectedLayerIndex}
  selectedKeyPosition={selectedKeyPosition}
  onKeyPositionClicked={setSelectedKeyPosition}
  onBindingApply={doUpdateBinding}
  encoderRotationLabel={encoderSummary?.rotationLabel}
/>
```

- [ ] **Step 2: Pass encoderRotationLabel through Keymap to tooltip**

In `src/keyboard/Keymap.tsx`, add `encoderRotationLabel` to `KeymapProps`:

```typescript
export interface KeymapProps {
  layout: PhysicalLayout;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  onKeyPositionClicked: (keyPosition: number) => void;
  onBindingApply?: (binding: BehaviorBinding) => void;
  encoderRotationLabel?: string;
}
```

Pass it through to `PhysicalLayoutComp`:

```tsx
<PhysicalLayoutComp
  positions={positions}
  oneU={48}
  hoverZoom={true}
  zoom={scale}
  selectedPosition={selectedKeyPosition}
  onPositionClicked={onKeyPositionClicked}
  onRecommendationApply={onBindingApply}
  encoderRotationLabel={encoderRotationLabel}
/>
```

Add `encoderRotationLabel` to `PhysicalLayoutProps` in PhysicalLayout.tsx and pass through to Key. In Key.tsx, pass it to KeyTooltip's `encoderRotationLabel` prop.

- [ ] **Step 3: Run all tests, lint, and build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: ALL PASS, 0 errors, build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/keyboard/Keyboard.tsx src/keyboard/Keymap.tsx src/keyboard/PhysicalLayout.tsx src/keyboard/Key.tsx
git commit -m "feat: integrate encoder rotation data into tooltip"
```

---

### Task 7: Manual Verification with Real Device

Connect minimal-keys via Tauri and verify the full tooltip flow.

- [ ] **Step 1: Start Tauri dev**

Run: `npm run tauri dev`

- [ ] **Step 2: Connect keyboard via BLE**

- [ ] **Step 3: Verify letter key tooltip**

Hover over a letter key (e.g., A). Verify:
- Popover appears after ~200ms
- Shows "A — 文字入力"
- Disappears on mouse leave

- [ ] **Step 4: Verify thumb key tooltip**

Hover over a thumb key (e.g., position 38, left thumb center). Verify:
- Shows role name + description
- Shows 2-3 recommendations
- "もっと見る →" link works (opens picker)
- Clicking a recommendation applies the binding

- [ ] **Step 5: Verify shortcut key tooltip**

Set a key to Ctrl+C. Hover over it. Verify:
- Shows "コピーする" (reverse-looked up from use-cases.ts)
- Shows description

- [ ] **Step 6: Verify encoder tooltip**

Hover over position 0 (encoder). Verify:
- Shows "🎛 ロータリーエンコーダ"
- Shows "回す: [current rotation binding]" with "設定→"
- Shows "押す: [current press binding]" with "設定→"
- Shows adjustable options list

- [ ] **Step 7: Verify None key tooltip**

Set a key to None. Hover. Verify:
- Shows "無効 — キーを押しても何も起きません"

- [ ] **Step 8: Verify encoder position index**

If the encoder tooltip appears on the wrong key, update `ENCODER_POSITION` in `key-descriptions.ts` with the correct index. Log `keyPosition` in the console to find the right value.

- [ ] **Step 9: Commit any corrections**

```bash
git add -A
git commit -m "fix: corrections from manual tooltip verification"
```
