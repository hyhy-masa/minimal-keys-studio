import { invoke } from "@tauri-apps/api/core";

type FrontendLogLevel = "error" | "warn" | "info";

const MAX_LOG_LENGTH = 8_000;

function limit(value: string): string {
  return value.length > MAX_LOG_LENGTH ? `${value.slice(0, MAX_LOG_LENGTH)}…[truncated]` : value;
}

function formatValue(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const suppressedConsoleErrors = new Map<unknown, number>();

function suppressConsoleErrorFor(value: unknown): void {
  suppressedConsoleErrors.set(value, (suppressedConsoleErrors.get(value) ?? 0) + 1);
  queueMicrotask(() => suppressedConsoleErrors.delete(value));
}

export function logFrontend(level: FrontendLogLevel, message: string, error?: unknown): void {
  const stack = error instanceof Error ? error.stack : undefined;
  const entry = {
    level,
    message: limit(message),
    ...(stack ? { stack: limit(stack) } : {}),
  };

  try {
    void invoke("log_from_frontend", entry).catch(() => undefined);
  } catch {
    // Native log forwarding is best-effort and must not affect the application.
  }
}

export function installFrontendLogForwarding(): void {
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...values: Array<unknown>) => {
    originalError(...values);
    if (values.some((value) => (suppressedConsoleErrors.get(value) ?? 0) > 0)) return;
    logFrontend("error", values.map(formatValue).join(" "), values.find((value) => value instanceof Error));
  };
  console.warn = (...values: Array<unknown>) => {
    originalWarn(...values);
    logFrontend("warn", values.map(formatValue).join(" "), values.find((value) => value instanceof Error));
  };

  const previousOnError = window.onerror;
  window.onerror = (message, source, line, column, error) => {
    logFrontend(
      "error",
      `Uncaught exception: ${String(message)}${source ? ` (${source}:${line}:${column})` : ""}`,
      error
    );
    return previousOnError?.call(window, message, source, line, column, error) ?? false;
  };

  const previousUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    suppressConsoleErrorFor(reason);
    logFrontend(
      "error",
      `Unhandled promise rejection: ${formatValue(reason)}`,
      reason
    );
    return previousUnhandledRejection?.call(window, event);
  };
}
