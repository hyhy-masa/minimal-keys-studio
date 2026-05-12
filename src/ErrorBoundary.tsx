import { Component, type ErrorInfo, type ReactNode } from "react";
import { enqueueEvent } from "./telemetry/telemetry-client";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, errorInfo);
    try {
      const deviceId = localStorage.getItem("telemetry-device-id") || "unknown";
      enqueueEvent({
        type: "error",
        deviceId,
        appVersion: "unknown",
        timestamp: new Date().toISOString(),
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack ?? undefined,
      });
    } catch {
      // telemetry must never break error recovery
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-8">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-bold text-gray-800 mb-4">
              問題が発生しました
            </h1>
            <p className="text-sm text-gray-600 mb-2">
              キーボードの設定は影響を受けていません。安心してください。
            </p>
            <p className="text-xs text-gray-400 mb-6">
              {this.state.error?.message}
            </p>
            <button
              onClick={this.handleReload}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
            >
              再読み込み
            </button>
            <div className="mt-8 p-4 bg-gray-100 rounded-lg text-left">
              <p className="text-xs text-gray-500 font-medium mb-2">
                それでも直らない場合:
              </p>
              <p className="text-xs text-gray-400">
                アプリを再起動して、ヘッダーの「設定を初期化」をクリックすると
                出荷時の設定に戻せます。
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
