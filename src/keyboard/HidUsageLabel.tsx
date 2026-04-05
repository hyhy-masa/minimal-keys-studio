import {
  hid_usage_get_labels,
  hid_usage_page_and_id_from_usage,
} from "../hid-usages";

export interface HidUsageLabelProps {
  hid_usage: number;
}

function remove_prefix(s?: string) {
  return s?.replace(/^Keyboard /, "");
}

// Extract modifier flags from upper byte of HID usage
function getModPrefix(rawPage: number): string {
  const modFlags = rawPage >> 8;
  if (!modFlags) return "";

  const parts: string[] = [];
  if (modFlags & 0x01) parts.push("Ctrl");
  if (modFlags & 0x02) parts.push("Shift");
  if (modFlags & 0x04) parts.push("Alt");
  if (modFlags & 0x08) parts.push("⌘");
  if (modFlags & 0x10) parts.push("RCtrl");
  if (modFlags & 0x20) parts.push("RShift");
  if (modFlags & 0x40) parts.push("RAlt");
  if (modFlags & 0x80) parts.push("R⌘");

  return parts.join("+") + "+";
}

export const HidUsageLabel = ({ hid_usage }: HidUsageLabelProps) => {
  const [rawPage, id] = hid_usage_page_and_id_from_usage(hid_usage);

  const modPrefix = getModPrefix(rawPage);
  const page = rawPage & 0xff;

  const labels = hid_usage_get_labels(page, id);

  const shortLabel = modPrefix + (remove_prefix(labels.short) ?? "");
  const medLabel = modPrefix + (remove_prefix(labels.med || labels.short) ?? "");
  const longLabel = modPrefix + (remove_prefix(labels.long || labels.med || labels.short) ?? "");

  return (
    <span
      className="@[10em]:before:content-[attr(data-long-content)] @[6em]:before:content-[attr(data-med-content)] before:content-[attr(aria-label)]"
      aria-label={shortLabel}
      data-med-content={medLabel}
      data-long-content={longLabel}
    />
  );
};
