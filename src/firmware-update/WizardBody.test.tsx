import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WizardBody } from "./WizardBody";
import { canCloseStep, type Manifest, type WizardState } from "./machine";
import { errorRecoveryButtonLabel, stepTitle } from "./ja";
import type { RecoveryActions } from "./useRecoveryActions";

const manifest: Manifest = {
  schema: 1,
  version: "1.5.0",
  requires_settings_reset: false,
};

const recovery: RecoveryActions = {
  retryCurrentStep: vi.fn(),
  flashOneSide: vi.fn(async () => {}),
  exportLog: vi.fn(async () => true),
};

function renderBody(state: WizardState, dispatch = vi.fn()) {
  render(
    <WizardBody
      state={state}
      progress={null}
      fw={{ version: null, supported: false }}
      dispatch={dispatch}
      cancel={vi.fn()}
      onClose={vi.fn()}
      start={vi.fn(async () => {})}
      recovery={recovery}
    />
  );
  return dispatch;
}

describe("WizardBody", () => {
  it("C-1: shows the manifest version after done even when firmware is disconnected", () => {
    renderBody({ step: "done", manifest });

    expect(screen.getByText("バージョン 1.5.0 を書き込みました")).toBeTruthy();
  });

  it("C-2: shows the unknown-version guidance and enables the update action", () => {
    renderBody({ step: "show_release", manifest });

    expect(screen.getByText("確認できません（更新には支障ありません）")).toBeTruthy();
    expect(screen.getByText("最新版を書き込めます")).toBeTruthy();
    expect(screen.getByText("更新する")).not.toHaveAttribute("disabled");
  });

  it("C-3: shows up-to-date when the supported firmware version equals the latest", () => {
    render(
      <WizardBody
        state={{ step: "show_release", manifest }}
        progress={null}
        fw={{ version: "1.5.0", supported: true }}
        dispatch={vi.fn()}
        cancel={vi.fn()}
        onClose={vi.fn()}
        start={vi.fn(async () => {})}
        recovery={recovery}
      />
    );

    expect(screen.getByText("お使いのファームウェアは最新です")).toBeTruthy();
  });

  it.each([
    ["R", "existing", "この右半分はすでに書き込みモードになっています。", { type: "CONFIRM_WRITE_R" }],
    ["R", "new", "右側を書き込みモードで検出しました。", { type: "CONFIRM_WRITE_R" }],
    ["L", "existing", "この左半分はすでに書き込みモードになっています。", { type: "CONFIRM_WRITE_L" }],
    ["L", "new", "左側を書き込みモードで検出しました。", { type: "CONFIRM_WRITE_L" }],
  ] as const)("C-4: renders %s %s confirmation and dispatches its write event", (_side, origin, copy, event) => {
    const dispatch = renderBody({
      step: event.type === "CONFIRM_WRITE_R" ? "r_flash_confirm" : "l_flash_confirm",
      manifest,
      origin,
    });

    expect(screen.getByText((content) => content.startsWith(copy))).toBeTruthy();
    screen.getByText("このまま進める").click();
    expect(dispatch).toHaveBeenCalledWith(event);
  });

  it.each(["existing", "new"] as const)(
    "C-4a: renders the right-side guide photo for %s confirmation",
    (origin) => {
      renderBody({ step: "r_flash_confirm", manifest, origin });

      expect(screen.getByRole("img", { name: /右半分のリセットボタンの位置/ })).toBeTruthy();
    }
  );

  it("C-5: uses the distinct error recovery button label", () => {
    renderBody({ step: "error", message: "書き込みに失敗しました", from: "r_flashing" });

    expect(screen.getByText(errorRecoveryButtonLabel)).toBeTruthy();
    expect(errorRecoveryButtonLabel).not.toBe(stepTitle.recovery);
  });

  it("C-6: keeps only the new confirmation states non-dismissable", () => {
    expect(canCloseStep("r_flash_confirm")).toBe(false);
    expect(canCloseStep("l_flash_confirm")).toBe(false);

    for (const step of [
      "idle",
      "show_release",
      "done",
      "blocked",
      "error",
      "recovery",
      "recovery_waiting",
      "recovery_done",
    ] as const) {
      expect(canCloseStep(step)).toBe(true);
    }
  });
});
