import { describe, expect, it } from "vitest";
import * as Macros from "../proto/macros";
import {
  SPEEDS,
  clampWaitStep,
  estimateMs,
  firstFreeSlot,
  formatSeconds,
  rowsToSteps,
  slotLabel,
  speedOf,
  stepsToRows,
  type MacroRow,
} from "./macro-model";
import { textToValues } from "./macro-text";

const tap = (value: number): Macros.Step => ({ type: Macros.STEP_TAP, value });
const wait = (ms: number): Macros.Step => ({ type: Macros.STEP_WAIT, value: ms });
const ENTER = 0x070028;
const CTRL_C = 0x01070006;
const strip = (rows: MacroRow[]) => rows.map(({ id: _id, ...r }) => r); // eslint-disable-line @typescript-eslint/no-unused-vars

describe("stepsToRows (reading back from the keyboard)", () => {
  it("merges consecutive character taps into one 文字 row", () => {
    const text = textToValues("yamada@example.com", "jis").values.map(tap);
    const rows = stepsToRows([...text, tap(ENTER)], "jis");
    expect(strip(rows)).toEqual([
      { kind: "text", text: "yamada@example.com" },
      { kind: "key", value: ENTER },
    ]);
  });

  it("splits text around keys and waits", () => {
    const rows = stepsToRows(
      [...textToValues("ab", "us").values.map(tap), tap(CTRL_C), wait(300), ...textToValues("C", "us").values.map(tap)],
      "us",
    );
    expect(strip(rows)).toEqual([
      { kind: "text", text: "ab" },
      { kind: "key", value: CTRL_C },
      { kind: "wait", ms: 300 },
      { kind: "text", text: "C" },
    ]);
  });

  it("reads a tap by the chosen layout", () => {
    const at = 0x07002f; // @ on JIS, [ on US
    expect(strip(stepsToRows([tap(at)], "jis"))).toEqual([{ kind: "text", text: "@" }]);
    expect(strip(stepsToRows([tap(at)], "us"))).toEqual([{ kind: "text", text: "[" }]);
  });

  it("keeps press and release steps as read-only rows", () => {
    const rows = stepsToRows([{ type: Macros.STEP_PRESS, value: 0x0700e1 }, { type: Macros.STEP_RELEASE, value: 0x0700e1 }], "jis");
    expect(strip(rows)).toEqual([
      { kind: "raw", type: 2, value: 0x0700e1 },
      { kind: "raw", type: 3, value: 0x0700e1 },
    ]);
  });

  it("an empty macro has no rows", () => {
    expect(stepsToRows([], "jis")).toEqual([]);
  });
});

describe("rowsToSteps (saving)", () => {
  it("round-trips through stepsToRows", () => {
    const original = [...textToValues("Hi!", "jis").values.map(tap), tap(ENTER), wait(1000), { type: 2, value: 0x0700e1 }];
    const back = rowsToSteps(stepsToRows(original, "jis"), "jis");
    expect(back.steps).toEqual(original);
    expect(back.invalidChars.size).toBe(0);
  });

  it("leaves untypable characters out and reports them per row", () => {
    const rows: MacroRow[] = [{ id: "r1", kind: "text", text: "aあb" }];
    const r = rowsToSteps(rows, "jis");
    expect(r.steps).toHaveLength(2);
    expect(r.invalidChars.get("r1")).toEqual([1]);
  });

  it("skips a key row with no key yet", () => {
    expect(rowsToSteps([{ id: "k", kind: "key", value: 0 }], "jis").steps).toEqual([]);
  });
});

describe("timing and slots", () => {
  it("estimates tap as tap+wait and a wait step as its own ms", () => {
    expect(estimateMs([tap(1), tap(2), wait(500)], 30, 40)).toBe(640);
    expect(formatSeconds(640)).toBe("0.6");
    expect(formatSeconds(2200)).toBe("2.2");
  });

  it("speed presets match the design", () => {
    expect(SPEEDS.map((s) => [s.label, s.tapMs, s.waitMs])).toEqual([
      ["ふつう", 30, 40],
      ["ゆっくり", 60, 80],
      ["とてもゆっくり", 100, 150],
    ]);
    expect(speedOf(60, 80)?.id).toBe("slow");
    expect(speedOf(45, 40)).toBeNull();
  });

  it("finds the first free slot and labels slots from M1", () => {
    expect(firstFreeSlot(4, [0, 1, 3])).toBe(2);
    expect(firstFreeSlot(2, [0, 1])).toBeNull();
    expect(slotLabel(0)).toBe("M1");
    expect(slotLabel(15)).toBe("M16");
  });

  it("clamps a wait step to 1–10000 ms", () => {
    expect(clampWaitStep(0)).toBe(1);
    expect(clampWaitStep(20000)).toBe(10000);
    expect(clampWaitStep(250.4)).toBe(250);
  });
});
