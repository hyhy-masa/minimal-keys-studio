import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { enqueueEvent } from "./telemetry/telemetry-client.ts";
import "./index.css";

function trackGlobalError(message: string, stack?: string): void {
  try {
    const deviceId = localStorage.getItem("telemetry-device-id") || "unknown";
    enqueueEvent({
      type: "error",
      deviceId,
      appVersion: "unknown",
      timestamp: new Date().toISOString(),
      message,
      stack,
    });
  } catch {
    // telemetry must never break the app
  }
}

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  const reason = event.reason;
  trackGlobalError(
    reason instanceof Error ? reason.message : String(reason),
    reason instanceof Error ? reason.stack : undefined
  );
});

window.addEventListener("error", (event) => {
  trackGlobalError(event.message, event.error?.stack);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
