import { useEffect, useState } from "react";
import { useModalRef } from "../misc/useModalRef";
import { GenericModal } from "../GenericModal";
import { useTelemetry } from "./TelemetryProvider";

export function OptInDialog() {
  const { setOptedIn } = useTelemetry();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!window.__TAURI_INTERNALS__) return;
      const v = localStorage.getItem("telemetry-opt-in");
      if (v === null) setShow(true);
    } catch {
      // ignore
    }
  }, []);

  const dialog = useModalRef(show, false, false);

  const handleAccept = () => {
    setOptedIn(true);
    setShow(false);
  };

  const handleDecline = () => {
    setOptedIn(false);
    setShow(false);
  };

  if (!show) return null;

  return (
    <GenericModal ref={dialog} className="max-w-md">
      <h2 className="text-lg font-semibold mb-3">利用データの送信について</h2>
      <div className="text-sm text-base-content/80 flex flex-col gap-2 mb-4">
        <p>
          アプリの改善のため、匿名の利用データを開発者に送信してもよろしいですか？
        </p>
        <div>
          <p className="font-medium mb-1">送信するもの:</p>
          <ul className="list-disc list-inside text-xs text-base-content/60">
            <li>アプリの操作ログ（接続・保存・タブ切替など）</li>
            <li>エラー情報</li>
            <li>キーマップ設定（キー配置のみ）</li>
          </ul>
        </div>
        <div>
          <p className="font-medium mb-1">送信しないもの:</p>
          <ul className="list-disc list-inside text-xs text-base-content/60">
            <li>名前・メールアドレスなどの個人情報</li>
            <li>デバイスの識別情報（MACアドレスなど）</li>
          </ul>
        </div>
        <p className="text-xs text-base-content/50">
          この設定は「設定」タブからいつでも変更できます。
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          className="rounded bg-base-200 hover:bg-base-300 px-4 py-2 text-sm"
          onClick={handleDecline}
        >
          同意しない
        </button>
        <button
          className="rounded bg-primary text-primary-content hover:opacity-90 px-4 py-2 text-sm"
          onClick={handleAccept}
        >
          同意する
        </button>
      </div>
    </GenericModal>
  );
}
