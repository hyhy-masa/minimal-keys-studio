import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ComboActionPicker } from "./ComboActionPicker";
import { OsModeProvider } from "../OsModeContext";
import type { Binding } from "../proto/combos";

const behaviors = [
  { id: 3, displayName: "Key Press", metadata: [] },
  { id: 4, displayName: "Momentary Layer", metadata: [] },
  { id: 5, displayName: "Mod-Tap", metadata: [] },
] as never[];

const layers = [
  { id: 0, index: 0, name: "Base" },
  { id: 1, index: 1, name: "Num" },
];

function Demo({ initial }: { initial: Binding | null }) {
  const [binding, setBinding] = useState(initial);
  const [pending, setPending] = useState(0);
  return (
    <OsModeProvider>
      <div className="w-[640px] max-w-full p-4">
        <ComboActionPicker
          binding={binding}
          pendingModifiers={pending}
          onPendingModifiersChange={setPending}
          onBindingChange={setBinding}
          behaviors={behaviors}
          layers={layers}
        />
      </div>
    </OsModeProvider>
  );
}

const meta = {
  title: "Combos/ComboActionPicker",
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { initial: null } };

export const AltEnter: Story = {
  args: { initial: { behaviorId: 3, param1: 0x04070028, param2: 0 } },
};
