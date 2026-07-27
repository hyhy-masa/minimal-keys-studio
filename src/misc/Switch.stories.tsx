import type { Meta, StoryObj } from "@storybook/react";
import { Switch } from "./Switch";

const meta = {
  title: "Misc/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    onChange: () => {},
    label: "自動切り替え",
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  args: {
    isSelected: false,
  },
};

export const On: Story = {
  args: {
    isSelected: true,
  },
};

export const Disabled: Story = {
  args: {
    isSelected: true,
    isDisabled: true,
  },
};

export const LongDescription: Story = {
  args: {
    isSelected: false,
    label: "トラックボールの自動切り替えを有効にする",
    description:
      "トラックボールを動かすと自動的に選択したレイヤーに切り替わり、手を止めると元のレイヤーに戻ります。",
  },
};
