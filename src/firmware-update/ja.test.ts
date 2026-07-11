import { describe, it, expect } from "vitest";
import { formatError } from "./ja";

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
] as const;

const FALLBACK = "予期しないエラーが発生しました。もう一度お試しください。";

describe("formatError (FlashError coverage)", () => {
  it.each(FLASH_ERROR_KINDS)("maps %s to a specific, non-fallback message", (kind) => {
    const msg = formatError({ kind });
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toBe(FALLBACK);
  });

  it("ManifestInvalid guides the user to update the app (F-4)", () => {
    const msg = formatError({ kind: "ManifestInvalid", detail: { reason: "schema mismatch" } });
    expect(msg).not.toBe(FALLBACK);
    expect(msg).toContain("アプリ");
  });

  it("Io returns an actionable file-operation message (F-4)", () => {
    const msg = formatError({ kind: "Io", detail: { reason: "eio" } });
    expect(msg).not.toBe(FALLBACK);
    expect(msg).toContain("ファイル操作");
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
