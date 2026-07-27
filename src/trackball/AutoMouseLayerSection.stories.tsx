import type { Meta, StoryObj } from "@storybook/react";
import { AutoMouseLayerSection } from "./AutoMouseLayerSection";

const layers = [
  { id: 4, index: 4, name: "ナビゲーション" },
  { id: 6, index: 6, name: "マウス" },
];

const meta = {
  title: "Trackball/AutoMouseLayerSection",
  component: AutoMouseLayerSection,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    onEnabledChange: () => {},
    onLayerChange: () => {},
    layerId: 6,
    layers,
  },
} satisfies Meta<typeof AutoMouseLayerSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  args: {
    enabled: false,
  },
};

export const On: Story = {
  args: {
    enabled: true,
  },
};

export const LoadingLayers: Story = {
  args: {
    enabled: false,
    layers: [],
  },
};

export const Disabled: Story = {
  args: {
    enabled: true,
    disabled: true,
  },
};
