import { describe, it, expect, vi } from "vitest";

// Extract the deduplication logic for testing
// This mirrors the logic in list_devices()
function deduplicateDevices(
  devices: Array<{ label: string; id: string }>
): Array<{ label: string; id: string }> {
  const byLabel = new Map<string, Array<{ label: string; id: string }>>();
  for (const d of devices) {
    const group = byLabel.get(d.label) || [];
    group.push(d);
    byLabel.set(d.label, group);
  }
  const result: Array<{ label: string; id: string }> = [];
  for (const [label, devs] of byLabel) {
    if (devs.length === 1) {
      result.push(devs[0]);
    } else {
      for (const d of devs) {
        const shortId = d.id.replace(/[^a-f0-9]/gi, "").slice(-4);
        result.push({ ...d, label: `${label} (${shortId})` });
      }
    }
  }
  return result;
}

describe("BLE device list deduplication", () => {
  it("shows single device without suffix", () => {
    const devices = [{ label: "minimal-keys", id: '"abc-1234"' }];
    const result = deduplicateDevices(devices);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("minimal-keys");
  });

  it("adds short ID suffix when same name appears multiple times", () => {
    const devices = [
      { label: "minimal-keys", id: '"06ab193c-3ef6"' },
      { label: "minimal-keys", id: '"08bf679f-67c9"' },
    ];
    const result = deduplicateDevices(devices);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("minimal-keys (3ef6)");
    expect(result[1].label).toBe("minimal-keys (67c9)");
  });

  it("keeps different device names separate without suffix", () => {
    const devices = [
      { label: "minimal-keys", id: '"aaa-1111"' },
      { label: "other-keyboard", id: '"bbb-2222"' },
    ];
    const result = deduplicateDevices(devices);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("minimal-keys");
    expect(result[1].label).toBe("other-keyboard");
  });

  it("handles mix of unique and duplicate names", () => {
    const devices = [
      { label: "minimal-keys", id: '"06ab193c-3ef6"' },
      { label: "minimal-keys", id: '"08bf679f-67c9"' },
      { label: "other-keyboard", id: '"ccc-3333"' },
    ];
    const result = deduplicateDevices(devices);
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe("minimal-keys (3ef6)");
    expect(result[1].label).toBe("minimal-keys (67c9)");
    expect(result[2].label).toBe("other-keyboard");
  });
});
