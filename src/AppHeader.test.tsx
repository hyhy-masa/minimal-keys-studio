import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
vi.mock("./update/versionCheck", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./update/versionCheck")>()),
  checkForUpdate: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

import { AppHeader } from "./AppHeader";
import { isFirmwareUpdateEnabled } from "./firmware-update/isTauri";
import { checkForUpdate } from "./update/versionCheck";
import { openUrl } from "@tauri-apps/plugin-opener";

beforeEach(() => {
  vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(false);
});

describe("AppHeader", () => {
  it("keeps every toolbar control visible without horizontal scrolling", () => {
    vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(true);
    render(
      <AppHeader
        connectedDeviceLabel="minimal-keys"
        isWireless={true}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onStartTour={vi.fn()}
        onFwUpdateOpenChange={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "操作ツールバー" });
    expect(toolbar).not.toHaveClass("min-w-0", "overflow-x-auto");
    expect(screen.getByRole("button", { name: "ワイヤレスで接続中: minimal-keys" })).toBeInTheDocument();

    for (const name of [
      "Mac",
      "Windows",
      "元に戻す",
      "やり直し",
      "保存",
      "破棄",
      "ファームウェア更新",
      "アプリ更新",
      "使い方を見る",
    ]) {
      expect(screen.getByRole("button", { name })).toHaveClass("shrink-0");
    }
  });

  it("fits the worst-case toolbar inside the 900px window width budget", () => {
    // Hand-measured rendered widths at the current font and spacing: each
    // control group includes its own padding, margins, and adjacent flex gaps.
    const minimumWindowWidth = 900;
    const leftZoneWidth = 124;
    const toolbarWidths = {
      osToggle: 120,
      undoRedo: 92,
      saveDiscard: 92,
      firmwareUpdate: 112,
      appUpdateAvailable: 156,
      help: 44,
      toolbarPaddingAndGaps: 53,
    };
    // Buttons the table above accounts for: Mac, Windows, 元に戻す, やり直し,
    // 保存, 破棄, ファームウェア更新, アプリ更新, 使い方を見る.
    const budgetedButtons = 9;
    const toolbarWidth = Object.values(toolbarWidths).reduce((sum, width) => sum + width, 0);

    expect(toolbarWidth).toBeLessThanOrEqual(minimumWindowWidth - leftZoneWidth);

    // The sum alone cannot notice a control that was added without being
    // measured, so pin the button count to the table. Adding a toolbar button
    // fails here until its width is folded into toolbarWidths above.
    vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(true);
    render(
      <AppHeader
        connectedDeviceLabel="minimal-keys"
        isWireless={true}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onStartTour={vi.fn()}
        onFwUpdateOpenChange={vi.fn()}
      />,
    );
    const toolbar = screen.getByRole("toolbar", { name: "操作ツールバー" });
    expect(toolbar.querySelectorAll("button")).toHaveLength(budgetedButtons);
  });

  it.each([
    [true, "ワイヤレスで接続中: minimal-keys"],
    [false, "USBで接続中: minimal-keys"],
  ])("labels the connection type and device name accessibly", (isWireless, label) => {
    render(<AppHeader connectedDeviceLabel="minimal-keys" isWireless={isWireless} />);

    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("labels a missing connection as disconnected", () => {
    render(<AppHeader />);

    expect(screen.getByRole("button", { name: "未接続" })).toBeDisabled();
  });

  it("shows the device name as a non-interactive first menu row", async () => {
    render(<AppHeader connectedDeviceLabel="minimal-keys" isWireless={false} />);

    fireEvent.click(screen.getByRole("button", { name: "USBで接続中: minimal-keys" }));

    const deviceRow = await screen.findByText("minimal-keys");
    expect(deviceRow).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByRole("menuitem")[1]).toHaveTextContent("切断");
  });

  it("keeps Japanese update labels on one line", () => {
    vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(true);
    render(<AppHeader onFwUpdateOpenChange={vi.fn()} />);

    expect(screen.getByText("ファーム更新")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("アプリ更新")).toHaveClass("whitespace-nowrap");
  });

  it("手動確認で更新が見つかった場合は版名とダウンロード導線を表示する", async () => {
    let resolveCheck: ((result: Awaited<ReturnType<typeof checkForUpdate>>) => void) | undefined;
    vi.mocked(checkForUpdate).mockImplementation(
      () => new Promise((resolve) => { resolveCheck = resolve; }),
    );
    vi.mocked(openUrl).mockResolvedValue(undefined);
    render(<AppHeader />);

    fireEvent.click(screen.getByRole("button", { name: "アプリ更新" }));
    fireEvent.click(screen.getByRole("button", { name: "更新を確認" }));

    expect(await screen.findByRole("button", { name: "確認中..." })).toBeDisabled();
    resolveCheck?.({
      status: "available",
      release: { tagName: "v0.5.0", htmlUrl: "https://example.com/v0.5.0" },
    });
    expect(await screen.findByText("新しいバージョン v0.5.0 があります")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ダウンロードページを開く" }));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith("https://example.com/v0.5.0"));
  });

  it("shows a persistent update label and badge when an update is available", () => {
    render(
      <AppHeader
        availableUpdate={{ tagName: "v1.2.3", htmlUrl: "https://example.com/release" }}
      />,
    );

    expect(screen.getByRole("button", { name: "アプリの更新があります" })).toHaveTextContent("アプリ更新あり");
    expect(screen.getByRole("status", { name: "アプリの更新があります" })).toBeInTheDocument();
  });

  it("gives the app update control a distinct label when no update is available", () => {
    render(<AppHeader />);

    expect(screen.getByRole("button", { name: "アプリ更新" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "ファームウェア更新" })).toBeTruthy();
  });

  it("calls onFwUpdateOpenChange(true) when the button is pressed", () => {
    vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(true);
    const onFwUpdateOpenChange = vi.fn();
    render(<AppHeader onFwUpdateOpenChange={onFwUpdateOpenChange} />);
    screen.getByRole("button", { name: "ファームウェア更新" }).click();
    expect(onFwUpdateOpenChange).toHaveBeenCalledWith(true);
  });

  it("hides the firmware-update button when the feature flag is off", () => {
    vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(false);
    render(<AppHeader />);
    expect(screen.queryByRole("button", { name: "ファームウェア更新" })).toBeNull();
  });

  it("does not show an update badge for firmware updates", () => {
    vi.mocked(isFirmwareUpdateEnabled).mockReturnValue(true);
    render(<AppHeader onFwUpdateOpenChange={vi.fn()} />);

    expect(screen.queryByRole("status", { name: "ファームウェアの更新があります" })).toBeNull();
  });
});
