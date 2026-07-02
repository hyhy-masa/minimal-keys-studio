import { describe, it, expect, vi } from "vitest";
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

  describe("failure handling", () => {
    it("releases the lock when a do-callback throws", async () => {
      const { result } = renderHook(() => useUndoRedo());

      await act(async () => {
        await expect(
          result.current[0](async () => {
            throw new Error("rpc failed");
          })
        ).rejects.toThrow("rpc failed");
      });

      // A successful operation must still work afterwards
      await act(async () => {
        await result.current[0](async () => async () => {});
      });
      expect(result.current[3]).toBe(true); // canUndo
    });

    it("releases the lock when an undo-callback throws", async () => {
      const { result } = renderHook(() => useUndoRedo());

      await act(async () => {
        await result.current[0](async () => async () => {
          throw new Error("undo failed");
        });
      });
      expect(result.current[3]).toBe(true); // canUndo

      await act(async () => {
        await expect(result.current[1]()).rejects.toThrow("undo failed");
      });

      // Lock must be released: the op moved to the redo stack and is usable
      expect(result.current[4]).toBe(true); // canRedo
    });

    it("ignores a second doIt while one is in progress", async () => {
      const { result } = renderHook(() => useUndoRedo());

      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const second = vi.fn(async () => async () => {});

      let firstPromise!: Promise<void>;
      act(() => {
        firstPromise = result.current[0](async () => {
          await gate;
          return async () => {};
        });
      });

      await act(async () => {
        await result.current[0](second);
      });
      expect(second).not.toHaveBeenCalled();

      release();
      await act(async () => {
        await firstPromise;
      });
      expect(result.current[3]).toBe(true); // canUndo from the first op
    });
  });
});
