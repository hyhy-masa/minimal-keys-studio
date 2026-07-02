import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { TourPromptDialog } from "./TourPromptDialog";

// jsdom does not implement <dialog> methods used by useModalRef
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

describe("TourPromptDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <TourPromptDialog open={false} onAccept={() => {}} onDecline={() => {}} />
    );
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("asks whether to see the guide when open", () => {
    render(
      <TourPromptDialog open onAccept={() => {}} onDecline={() => {}} />
    );
    expect(screen.getByText("使い方の案内を見ますか？")).toBeInTheDocument();
  });

  it("fires onAccept for 見る", () => {
    const onAccept = vi.fn();
    render(<TourPromptDialog open onAccept={onAccept} onDecline={() => {}} />);

    screen.getByText("見る").click();

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("fires onDecline for 今は見ない", () => {
    const onDecline = vi.fn();
    render(<TourPromptDialog open onAccept={() => {}} onDecline={onDecline} />);

    screen.getByText("今は見ない").click();

    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
