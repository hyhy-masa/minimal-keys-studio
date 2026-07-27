import { Switch as AriaSwitch } from "react-aria-components";

interface SwitchProps {
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  label: string;
  description?: string;
  isDisabled?: boolean;
}

export function Switch({
  isSelected,
  onChange,
  label,
  description,
  isDisabled = false,
}: SwitchProps) {
  return (
    <AriaSwitch
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
      className="group flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left outline-none transition-colors rac-focus-visible:ring-2 rac-focus-visible:ring-primary rac-focus-visible:ring-offset-2 rac-focus-visible:ring-offset-base-100 rac-disabled:cursor-not-allowed rac-disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-base-content">
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-sm leading-5 text-base-content/50">
            {description}
          </span>
        )}
      </span>
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-base-300 transition-colors duration-200 group-rac-selected:bg-primary">
        <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-base-100 shadow-sm transition-transform duration-200 group-rac-selected:translate-x-5" />
      </span>
    </AriaSwitch>
  );
}
