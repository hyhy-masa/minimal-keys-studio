import { describe, expect, it } from "vitest";
import { BLE_SAFE_WRITE_LEN, splitForBleWrite } from "./gatt";

describe("splitForBleWrite", () => {
  it("keeps a small frame as one write", () => {
    const frame = new Uint8Array([1, 2, 3]);
    expect(splitForBleWrite(frame)).toEqual([frame]);
  });

  it("cuts a macro-sized frame into pieces of at most 20 bytes, in order", () => {
    const frame = Uint8Array.from({ length: 101 }, (_, i) => i);
    const pieces = splitForBleWrite(frame);
    expect(pieces).toHaveLength(6);
    expect(pieces.every((p) => p.length <= BLE_SAFE_WRITE_LEN)).toBe(true);
    expect(Array.from(pieces.flatMap((p) => Array.from(p)))).toEqual(Array.from(frame));
  });

  it("an empty frame still produces one write", () => {
    expect(splitForBleWrite(new Uint8Array(0))).toHaveLength(1);
  });
});
