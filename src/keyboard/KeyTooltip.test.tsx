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
