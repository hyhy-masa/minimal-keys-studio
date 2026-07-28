import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

import { installFrontendLogForwarding, logFrontend } from "./frontendLogging";

describe("installFrontendLogForwarding", () => {
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalOnError: OnErrorEventHandler;
  let originalUnhandledRejection: WindowEventHandlers["onunhandledrejection"];

  beforeEach(() => {
    vi.resetModules();
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(undefined);
    originalError = console.error;
    originalWarn = console.warn;
    originalOnError = window.onerror;
    originalUnhandledRejection = window.onunhandledrejection;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    console.error = originalError;
    console.warn = originalWarn;
    window.onerror = originalOnError;
    window.onunhandledrejection = originalUnhandledRejection;
  });

  it("forwards an application log when DEV is false", async () => {
    vi.stubEnv("DEV", false);

    logFrontend("warn", "release connection diagnostic");
    await Promise.resolve();

    expect(mocks.invoke).toHaveBeenCalledWith("log_from_frontend", {
      level: "warn",
      message: "release connection diagnostic",
    });
  });

  it("forwards console.error without changing its original behavior", async () => {
    const error = new Error("stream is locked");
    const original = vi.fn();
    console.error = original;

    installFrontendLogForwarding();
    console.error("USB connection failed", error);
    await Promise.resolve();

    expect(original).toHaveBeenCalledWith("USB connection failed", error);
    expect(mocks.invoke).toHaveBeenCalledWith(
      "log_from_frontend",
      expect.objectContaining({
        level: "error",
        message: expect.stringContaining("USB connection failed"),
        stack: expect.stringContaining("stream is locked"),
      })
    );
  });

  it("forwards unhandled promise rejections with their stack", async () => {
    installFrontendLogForwarding();
    const reason = new Error("stream is locked");
    window.onunhandledrejection?.({ reason } as PromiseRejectionEvent);
    await Promise.resolve();

    expect(mocks.invoke).toHaveBeenCalledWith(
      "log_from_frontend",
      expect.objectContaining({
        level: "error",
        message: "Unhandled promise rejection: stream is locked",
        stack: expect.stringContaining("stream is locked"),
      })
    );
  });

  it("swallows forwarding failures", async () => {
    mocks.invoke.mockRejectedValue(new Error("native logging unavailable"));
    const original = vi.fn();
    console.warn = original;

    installFrontendLogForwarding();

    expect(() => console.warn("retrying connection")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(original).toHaveBeenCalledWith("retrying connection");
  });
});
