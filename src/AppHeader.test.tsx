import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
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
// The firmware-update modal pulls in the ts-client via the custom-subsystem
// hook; stub it (these header tests don't exercise it, and it is feature-flagged
// off outside Tauri anyway).
vi.mock("./firmware-update/FirmwareUpdateModal", () => ({
  FirmwareUpdateModal: () => null,
}));
// The "ファーム更新" button is gated on isFirmwareUpdateEnabled(), which is false
// outside Tauri. Mock it so the F-6 wiring can be exercised in jsdom.
vi.mock("./firmware-update/isTauri", () => ({
  isFirmwareUpdateEnabled: vi.fn(() => false),
}));

import { AppHeader } from "./AppHeader";
import { isFirmwareUpdateEnabled } from "./firmware-update/isTauri";

beforeEach(() => {
  vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(false);
});

describe("AppHeader", () => {
  it("shows a persistent update label and badge when an update is available", () => {
    render(
      <AppHeader
        availableUpdate={{ tagName: "v1.2.3", htmlUrl: "https://example.com/release" }}
      />,
    );

    expect(screen.getByRole("button", { name: "アプリの更新があります" })).toHaveTextContent("更新あり");
  });
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

describe("AppHeader firmware-update button (F-6)", () => {
  it("shows the firmware-update button when the feature flag is on", () => {
    vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(true);
    render(<AppHeader onFwUpdateOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /ファーム更新/ })).toBeTruthy();
  });

  it("calls onFwUpdateOpenChange(true) when the button is pressed", () => {
    vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(true);
    const onFwUpdateOpenChange = vi.fn();
    render(<AppHeader onFwUpdateOpenChange={onFwUpdateOpenChange} />);
    screen.getByRole("button", { name: /ファーム更新/ }).click();
    expect(onFwUpdateOpenChange).toHaveBeenCalledWith(true);
  });

  it("hides the firmware-update button when the feature flag is off", () => {
    vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(false);
    render(<AppHeader />);
    expect(screen.queryByRole("button", { name: /ファーム更新/ })).toBeNull();
  });
});
