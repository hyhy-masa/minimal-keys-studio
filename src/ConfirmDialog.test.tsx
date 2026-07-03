import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

// jsdom does not implement <dialog> methods used by useModalRef
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

const baseProps = {
  open: true,
  title: "コンボを削除",
  confirmLabel: "削除する",
};

describe("ConfirmDialog", () => {
  it("renders title, body and both buttons when open", () => {
    render(
      <ConfirmDialog {...baseProps} onConfirm={vi.fn()} onCancel={vi.fn()}>
        <p>この操作は元に戻せません。</p>
      </ConfirmDialog>
    );

    expect(screen.getByText("コンボを削除")).toBeTruthy();
    expect(screen.getByText("この操作は元に戻せません。")).toBeTruthy();
    expect(screen.getByText("削除する")).toBeTruthy();
    expect(screen.getByText("キャンセル")).toBeTruthy();
  });

  it("calls onConfirm (not onCancel) when the confirm button is pressed", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog {...baseProps} onConfirm={onConfirm} onCancel={onCancel}>
        <p>body</p>
      </ConfirmDialog>
    );

    screen.getByText("削除する").click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel (not onConfirm) when the cancel button is pressed", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog {...baseProps} onConfirm={onConfirm} onCancel={onCancel}>
        <p>body</p>
      </ConfirmDialog>
    );

    screen.getByText("キャンセル").click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("applies error styling to the confirm button when destructive", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        destructive
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        <p>body</p>
      </ConfirmDialog>
    );

    expect(screen.getByText("削除する").className).toContain("bg-error");
  });

  it("ignores the native close event after a confirm press (no double cancel)", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog {...baseProps} onConfirm={onConfirm} onCancel={onCancel}>
        <p>body</p>
      </ConfirmDialog>
    );

    screen.getByText("削除する").click();
    // Native <dialog> close event fired when the parent closes the dialog.
    container.querySelector("dialog")!.dispatchEvent(new Event("close"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("treats a native close with no button press (Esc) as a single cancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog {...baseProps} onConfirm={onConfirm} onCancel={onCancel}>
        <p>body</p>
      </ConfirmDialog>
    );

    container.querySelector("dialog")!.dispatchEvent(new Event("close"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses a custom cancel label when provided", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        cancelLabel="やめる"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        <p>body</p>
      </ConfirmDialog>
    );

    expect(screen.getByText("やめる")).toBeTruthy();
  });
});
