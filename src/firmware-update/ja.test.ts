import { afterEach, describe, expect, it, vi } from "vitest";
import { errorRecoveryButtonLabel, formatError, stepTitle } from "./ja";

// The canonical FlashError variants (crates/mk-flash-core/src/error.rs, tagged
// `kind`). Every one must map to a real, non-technical Japanese sentence — never
// the generic fallback — so that a newly added or renamed variant trips this
// test instead of silently shipping a "予期しないエラー" dead-end to a customer.
// (F-4 / code-reviewer m-2)
const FLASH_ERROR_KINDS = [
  "NoBootloaderVolume",
  "MultipleBootloaderVolumes",
  "NotUf2Volume",
  "InvalidUf2",
  "WriteFailed",
  "PrematureReboot",
  "UnmountTimeout",
  "DownloadFailed",
  "ChecksumMismatch",
  "ManifestInvalid",
  "Cancelled",
  "PermissionDenied",
  "Io",
  "ConnectionLost",
] as const;

const FALLBACK = "予期しないエラーが発生しました。もう一度お試しください。";

describe("formatError (FlashError coverage)", () => {
  it.each(FLASH_ERROR_KINDS)("maps %s to a specific, non-fallback message", (kind) => {
    const msg = formatError({ kind });
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toBe(FALLBACK);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ManifestInvalid with an unsupported schema tells the customer to update the app", () => {
    const error = {
      kind: "ManifestInvalid",
      detail: { reason: "unsupported manifest schema 3 (expected 2)" },
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(formatError(error)).toBe(
      "配布されている更新情報は、このアプリが対応していない形式です。最新のアプリを確認して、もう一度お試しください。"
    );
    expect(log).toHaveBeenCalledWith("[Firmware update] ManifestInvalid:", error);
  });

  it("ManifestInvalid other than an unsupported schema does not blame the app", () => {
    const error = { kind: "ManifestInvalid", detail: { reason: "missing sha256 for flash target" } };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const msg = formatError(error);

    expect(msg).toBe(
      "配布されている更新情報を読み取れませんでした。時間をおいてもう一度お試しください。解決しない場合はサポートへご連絡ください。"
    );
    expect(msg).not.toContain("アプリが古い");
    expect(log).toHaveBeenCalledWith("[Firmware update] ManifestInvalid:", error);
  });

  it("Io returns an actionable file-operation message (F-4)", () => {
    const msg = formatError({ kind: "Io", detail: { reason: "eio" } });
    expect(msg).not.toBe(FALLBACK);
    expect(msg).toContain("ファイル操作");
  });

  it("ConnectionLost tells the customer to reconnect the cable", () => {
    expect(formatError({ kind: "ConnectionLost" })).toBe(
      "キーボードとの接続が切れたようです。ケーブルを挿し直して、もう一度お試しください。"
    );
  });

  it("errorRecoveryButtonLabel is non-empty and distinct from the recovery title", () => {
    expect(errorRecoveryButtonLabel).not.toBe("");
    expect(errorRecoveryButtonLabel).not.toBe(stepTitle.recovery);
  });

  it("falls back gracefully for unknown / malformed shapes", () => {
    expect(formatError({})).toBe(FALLBACK);
    expect(formatError(null)).toBe(FALLBACK);
    expect(formatError(undefined)).toBe(FALLBACK);
    expect(formatError({ kind: "SomeFutureVariant" })).toBe(FALLBACK);
  });

  it("passes a plain string error through unchanged", () => {
    expect(formatError("すでに日本語のメッセージ")).toBe("すでに日本語のメッセージ");
  });
});
