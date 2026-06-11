import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionsTab } from "./ActionsTab";

const mockBehaviors = [
  { id: 1, displayName: "Key Press", metadata: [] },
  { id: 2, displayName: "Mouse Key Press", metadata: [] },
];

describe("ActionsTab", () => {
  it("renders subcategory buttons", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    expect(screen.getByText("編集")).toBeTruthy();
    expect(screen.getByText("ウィンドウ")).toBeTruthy();
    expect(screen.getByText("ブラウザ")).toBeTruthy();
    expect(screen.getByText("スクロール")).toBeTruthy();
    expect(screen.getByText("マウス")).toBeTruthy();
    expect(screen.getByText("メディア")).toBeTruthy();
    expect(screen.getByText("ナビゲーション")).toBeTruthy();
  });

  it("shows editing shortcuts by default", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    expect(screen.getByText("コピー")).toBeTruthy();
    expect(screen.getByText("貼り付け")).toBeTruthy();
    expect(screen.getByText("置換")).toBeTruthy();
  });

  it("shows window shortcuts with Cmd+Tab for mac", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("ウィンドウ"));
    expect(screen.getByText("アプリ切替")).toBeTruthy();
    expect(screen.getByText("⌘+Tab")).toBeTruthy();
  });

  it("shows window shortcuts with Alt+Tab for windows", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="windows" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("ウィンドウ"));
    expect(screen.getByText("アプリ切替")).toBeTruthy();
    expect(screen.getByText("Alt+Tab")).toBeTruthy();
  });

  it("shows scroll items", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("スクロール"));
    expect(screen.getByText("スクロール上")).toBeTruthy();
    expect(screen.getByText("スクロール下")).toBeTruthy();
    expect(screen.getByText("横スクロール左")).toBeTruthy();
    expect(screen.getByText("横スクロール右")).toBeTruthy();
  });

  it("shows mouse buttons when mouse subcategory selected", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("マウス"));
    expect(screen.getByText("左クリック")).toBeTruthy();
    expect(screen.getByText("右クリック")).toBeTruthy();
  });

  it("shows media controls when media subcategory selected", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("メディア"));
    expect(screen.getByText("再生/一時停止")).toBeTruthy();
    expect(screen.getByText("音量を上げる")).toBeTruthy();
  });

  it("shows navigation keys when nav subcategory selected", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("ナビゲーション"));
    expect(screen.getByText("↑")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
  });

  it("calls onApplyBinding for mouse click", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("マウス"));
    fireEvent.click(screen.getByText("左クリック"));
    expect(onApply).toHaveBeenCalledWith({ behaviorId: 2, param1: 0x01, param2: 0 });
  });

  it("shows browser shortcuts", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("ブラウザ"));
    expect(screen.getByText("新規タブ")).toBeTruthy();
    expect(screen.getByText("タブを復元")).toBeTruthy();
    expect(screen.getByText("DevTools")).toBeTruthy();
  });

  it("shows text navigation shortcuts", () => {
    const onApply = vi.fn();
    render(<ActionsTab behaviors={mockBehaviors} layers={[]} osMode="mac" onApplyBinding={onApply} />);
    fireEvent.click(screen.getByText("テキスト移動"));
    expect(screen.getByText("次の単語")).toBeTruthy();
    expect(screen.getByText("行頭")).toBeTruthy();
    expect(screen.getByText("単語選択(右)")).toBeTruthy();
  });
});
