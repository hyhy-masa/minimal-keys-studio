import { describe, expect, it } from "vitest";

import { getAutoConnectFailureText } from "./ja";

describe("getAutoConnectFailureText", () => {
  it("tells the user that a BLE output blocks the USB connection when the keyboard does not respond", () => {
    const text = getAutoConnectFailureText("no-response");

    expect(text).toContain("右手側");
    expect(text).toContain("出力先が「BLE」のままだと、USBではつながりません");
    expect(text).toContain("出力先を「USB」に切り替えて");
  });
});
