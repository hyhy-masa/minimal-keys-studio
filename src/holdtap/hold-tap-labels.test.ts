import { describe, it, expect } from "vitest";
import { holdTapLabel, isHoldTapVisible } from "./hold-tap-labels";

describe("holdTapLabel", () => {
  it("キーマップにある項目は日本語になる", () => {
    expect(holdTapLabel("layer_tap").name).toBe("スペース / Delete");
    expect(holdTapLabel("mod_tap").name).toBe("⌘ / Shift");
    expect(holdTapLabel("lt_rep").name).toBe("BackSpace");
  });

  it("スクロール専用の項目を引ける", () => {
    // ファームウェアに lt_scroll を足したとき、英字のまま出ないこと
    const label = holdTapLabel("lt_scroll");
    expect(label.name).toBe("スクロール");
    expect(label.description).toContain("Enter");
  });

  it("使われていない項目は画面に出さない", () => {
    // lt_to_layer_0 はキーマップから参照0＝触っても何も起きないつまみ
    expect(isHoldTapVisible("lt_to_layer_0")).toBe(false);
  });

  it("使う項目は画面に出す", () => {
    for (const node of ["layer_tap", "mod_tap", "lt_rep", "lt_scroll"]) {
      expect(isHoldTapVisible(node), node).toBe(true);
    }
  });

  it("知らない項目は隠さない", () => {
    // ファームウェアが項目を増やしたとき、黙って消えないこと
    expect(isHoldTapVisible("lt_future")).toBe(true);
  });

  it("知らない名前はノード名のまま返す", () => {
    // ファームウェアだけ先に新しくなって項目が増えても、画面が空にならないこと
    expect(holdTapLabel("lt_future").name).toBe("lt_future");
    expect(holdTapLabel("lt_future").description).toBeUndefined();
  });

  it("日本語の項目には説明が付く", () => {
    for (const node of ["layer_tap", "mod_tap", "lt_rep", "lt_scroll"]) {
      expect(holdTapLabel(node).description, node).toBeTruthy();
    }
  });
});
