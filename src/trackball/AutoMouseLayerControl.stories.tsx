import type { Meta, StoryObj } from "@storybook/react";
import { AutoMouseLayerControlView } from "./AutoMouseLayerControl";

const layers = [
  { id: 4, index: 4, name: "ナビゲーション" },
  { id: 6, index: 6, name: "マウス" },
];

const meta = {
  title: "Trackball/AutoMouseLayerControl",
  component: AutoMouseLayerControlView,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    layerId: 6,
    layers,
    activationDelayMs: 100,
    deactivationDelayMs: 500,
    onEnabledChange: () => {},
    onLayerChange: () => {},
    onActivationDelayChange: () => {},
    onDeactivationDelayChange: () => {},
    onActivationDelayCommit: () => {},
    onDeactivationDelayCommit: () => {},
  },
} satisfies Meta<typeof AutoMouseLayerControlView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = { args: { enabled: true } };

export const Open: Story = { args: { enabled: true, detailsOpen: true } };

export const Off: Story = { args: { enabled: false, detailsOpen: true } };

export const Sending: Story = { args: { enabled: true, disabled: true, detailsOpen: true } };

export const LoadingLayers: Story = { args: { enabled: false, layers: [] } };
