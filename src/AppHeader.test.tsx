import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

// jsdom does not implement <dialog> methods used by useModalRef
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

// The ts-client package ships extension-less ESM imports that Vitest's node
// resolution cannot load; mock the modules that pull it in at runtime.
vi.mock("@zmkfirmware/zmk-studio-ts-client/core", () => ({
  LockState: {
    ZMK_STUDIO_CORE_LOCK_STATE_LOCKED: 0,
    ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED: 1,
  },
}));
vi.mock("./rpc/useConnectedDeviceData", () => ({
  useConnectedDeviceData: () => [false, vi.fn()],
}));

import { AppHeader } from "./AppHeader";

describe("AppHeader", () => {
  it("shows a help button that starts the tour", () => {
    const onStartTour = vi.fn();
    render(<AppHeader onStartTour={onStartTour} />);

    const button = screen.getByLabelText("使い方を見る");
    button.click();

    expect(onStartTour).toHaveBeenCalledTimes(1);
  });

  it("renders no help button without onStartTour", () => {
    render(<AppHeader />);
    expect(screen.queryByLabelText("使い方を見る")).toBeNull();
  });
});
