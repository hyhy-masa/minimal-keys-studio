import { describe, it, expect, vi } from "vitest";
import { safeRpcCall } from "./rpcCall";

describe("safeRpcCall", () => {
  it("returns result on success", async () => {
    const toast = vi.fn();
    const result = await safeRpcCall(
      () => Promise.resolve("ok"),
      toast,
      "Operation"
    );
    expect(result).toBe("ok");
    expect(toast).not.toHaveBeenCalled();
  });

  it("shows error toast and returns null on failure", async () => {
    const toast = vi.fn();
    const result = await safeRpcCall(
      () => Promise.reject(new Error("network error")),
      toast,
      "Save settings"
    );
    expect(result).toBeNull();
    expect(toast).toHaveBeenCalledWith("Save settings failed", "error");
  });

  it("logs error to console", async () => {
    const toast = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await safeRpcCall(
      () => Promise.reject(new Error("timeout")),
      toast,
      "Load data"
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
