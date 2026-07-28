import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppFooter } from "./AppFooter";

describe("AppFooter", () => {
  const props = {
    onShowAbout: vi.fn(),
    onShowLicenseNotice: vi.fn(),
  };

  it("shows the application version and no duplicate tour link", () => {
    render(<AppFooter {...props} />);
    expect(screen.getByText(/minimal-keys カスタマイズ v/)).toBeInTheDocument();
    expect(screen.queryByText("使い方を見る")).toBeNull();
  });
});
