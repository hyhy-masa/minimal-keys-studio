import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppFooter } from "./AppFooter";

describe("AppFooter", () => {
  const props = {
    onShowAbout: vi.fn(),
    onShowLicenseNotice: vi.fn(),
    onStartTour: vi.fn(),
  };

  it("shows the tour entry link", () => {
    render(<AppFooter {...props} />);
    expect(screen.getByText("使い方を見る")).toBeInTheDocument();
  });

  it("fires onStartTour when the link is clicked", () => {
    const onStartTour = vi.fn();
    render(<AppFooter {...props} onStartTour={onStartTour} />);

    screen.getByText("使い方を見る").click();

    expect(onStartTour).toHaveBeenCalledTimes(1);
  });
});
