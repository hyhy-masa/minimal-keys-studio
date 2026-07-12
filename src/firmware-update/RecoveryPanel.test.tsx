import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecoveryPanel } from "./RecoveryPanel";
import type { RecoveryActions } from "./useRecoveryActions";

const actions: RecoveryActions = {
  retryCurrentStep: vi.fn(),
  flashOneSide: vi.fn(async () => {}),
  exportLog: vi.fn(async () => true),
};

describe("RecoveryPanel", () => {
  it("C-7: puts the cable check before the reset-button instruction while waiting", () => {
    render(
      <RecoveryPanel
        state={{ step: "recovery_waiting", side: "R", from: null }}
        progress={null}
        actions={actions}
        dispatch={vi.fn()}
        cancel={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const copy = screen.getByText(/USB ケーブル/).textContent ?? "";
    expect(copy).toContain("ケーブルがつながっているか確認");
    expect(copy.indexOf("ケーブルがつながっているか確認")).toBeLessThan(copy.indexOf("リセットボタン"));
  });
});
