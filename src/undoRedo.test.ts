import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoRedo } from "./undoRedo";

describe("useUndoRedo", () => {
  it("reset is referentially stable across renders", () => {
    const { result, rerender } = renderHook(() => useUndoRedo());

    const resetFirst = result.current[5]; // reset is index 5
    rerender();
    const resetSecond = result.current[5];

    expect(resetFirst).toBe(resetSecond);
  });

  it("reset clears undo and redo stacks", async () => {
    const { result } = renderHook(() => useUndoRedo());

    const [doIt, , , , , reset] = result.current;

    // Add an operation to the undo stack
    await act(async () => {
      await doIt(async () => {
        return async () => {};
      });
    });

    // canUndo should be true
    expect(result.current[3]).toBe(true); // canUndo

    // Reset
    act(() => {
      reset();
    });

    // canUndo should be false after reset
    expect(result.current[3]).toBe(false); // canUndo
    expect(result.current[4]).toBe(false); // canRedo
  });
});
