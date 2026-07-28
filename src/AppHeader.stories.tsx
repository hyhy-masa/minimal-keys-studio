import type { Meta, StoryObj } from "@storybook/react";
import { AppHeader } from "./AppHeader";

const meta = {
  title: "Application/AppHeader",
  component: AppHeader,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  args: {
    connectedDeviceLabel: "minimal-keys",
    isWireless: true,
    canUndo: true,
    canRedo: true,
    onUndo: async () => undefined,
    onRedo: async () => undefined,
    onSave: () => undefined,
    onDiscard: () => undefined,
    onDisconnect: () => undefined,
    onResetSettings: () => undefined,
    onStartTour: () => undefined,
    onFwUpdateOpenChange: () => undefined,
    firmwareUpdateEnabled: true,
  },
} satisfies Meta<typeof AppHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

const atWidth = (width: number): Story["decorators"] => [
  (StoryComponent) => (
    <div className="overflow-hidden bg-base-100" style={{ width }}>
      <StoryComponent />
    </div>
  ),
];

export const Narrow900WithoutUpdate: Story = {
  name: "狭い幅 900px / 更新なし",
  decorators: atWidth(900),
};

export const Narrow900WithUpdate: Story = {
  name: "狭い幅 900px / 更新あり",
  decorators: atWidth(900),
  args: {
    availableUpdate: {
      tagName: "v1.2.3",
      htmlUrl: "https://example.com/release",
    },
  },
};

export const Standard1400WithoutUpdate: Story = {
  name: "標準幅 1400px / 更新なし",
  decorators: atWidth(1400),
};

export const Standard1400WithUpdate: Story = {
  name: "標準幅 1400px / 更新あり",
  decorators: atWidth(1400),
  args: {
    availableUpdate: {
      tagName: "v1.2.3",
      htmlUrl: "https://example.com/release",
    },
  },
};

export const Wide2000WithoutUpdate: Story = {
  name: "広い幅 2000px / 更新なし",
  decorators: atWidth(2000),
};

export const Wide2000WithUpdate: Story = {
  name: "広い幅 2000px / 更新あり",
  decorators: atWidth(2000),
  args: {
    availableUpdate: {
      tagName: "v1.2.3",
      htmlUrl: "https://example.com/release",
    },
  },
};
