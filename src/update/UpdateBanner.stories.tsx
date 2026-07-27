import type { Meta, StoryObj } from "@storybook/react";
import { UpdateBanner } from "./UpdateBanner";

const meta = {
  title: "Application/UpdateBanner",
  component: UpdateBanner,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  args: {
    onDismiss: () => {},
  },
} satisfies Meta<typeof UpdateBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {
  args: {
    release: {
      tagName: "v1.2.3",
      htmlUrl: "https://github.com/hyhy-masa/minimal-keys-studio/releases/tag/v1.2.3",
    },
  },
};

export const LongVersion: Story = {
  args: {
    release: {
      tagName: "v2026.07.27-feature-release-candidate.1234567890+minimal-keys-studio",
      htmlUrl: "https://github.com/hyhy-masa/minimal-keys-studio/releases/tag/v2026.07.27-feature-release-candidate.1234567890+minimal-keys-studio",
    },
  },
};
