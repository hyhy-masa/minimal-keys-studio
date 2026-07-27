import type { Meta, StoryObj } from "@storybook/react";

import { ConnectionMethodPanel } from "./ConnectModal";

const meta = {
  title: "Application/ConnectModal",
  component: ConnectionMethodPanel,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    onUsbConnect: () => {},
    onWirelessConnect: () => {},
    onShowManualUsb: () => {},
  },
} satisfies Meta<typeof ConnectionMethodPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UsbSearching: Story = {
  args: {
    view: "usb-searching",
  },
};

export const UsbFailedWithManualList: Story = {
  args: {
    view: "usb-failed",
    failureText:
      "右手側（トラックボールのある方）をつないでください。左手側では設定できません。",
    children: (
      <div className="rounded-lg border border-base-300 bg-base-200/30 p-3 text-sm">
        <p className="font-medium">手動で選ぶ</p>
        <button className="mt-2 min-h-11 w-full rounded-md bg-base-300 px-3 text-left">
          接続できるキーボード
        </button>
      </div>
    ),
  },
};

export const WirelessList: Story = {
  args: {
    view: "wireless",
    children: (
      <div className="rounded-lg border border-base-300 bg-base-200/30 p-3 text-sm">
        <p className="font-medium">近くのキーボード</p>
        <button className="mt-2 min-h-11 w-full rounded-md bg-base-300 px-3 text-left">
          minimal-keys
        </button>
      </div>
    ),
  },
};

export const NoCandidates: Story = {
  args: {
    view: "usb-failed",
    failureText:
      "USBケーブルが挿さっているか確認してください。充電専用ケーブルではキーボードを認識できません。",
  },
};
