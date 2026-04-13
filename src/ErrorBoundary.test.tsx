import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

// Suppress console.error in test output
const originalError = console.error;
beforeEach(() => { console.error = vi.fn(); });
afterEach(() => { console.error = originalError; });

function ThrowingComponent({ message }: { message: string }): JSX.Element {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>正常なコンテンツ</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("正常なコンテンツ")).toBeTruthy();
  });

  it("shows fallback UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="テストエラー" />
      </ErrorBoundary>
    );
    expect(screen.getByText("問題が発生しました")).toBeTruthy();
    expect(screen.getByText("テストエラー")).toBeTruthy();
    expect(screen.getByText("再読み込み")).toBeTruthy();
    expect(screen.getByText(/設定を初期化/)).toBeTruthy();
  });

  it("has reload button", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="error" />
      </ErrorBoundary>
    );
    const button = screen.getByText("再読み込み");
    expect(button).toBeTruthy();
  });
});
