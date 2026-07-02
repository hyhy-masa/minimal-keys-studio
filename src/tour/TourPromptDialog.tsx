import { useModalRef } from "../misc/useModalRef";
import { GenericModal } from "../GenericModal";

export interface TourPromptDialogProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function TourPromptDialog({
  open,
  onAccept,
  onDecline,
}: TourPromptDialogProps) {
  const dialog = useModalRef(open, false, false);

  if (!open) return null;

  return (
    <GenericModal ref={dialog} className="max-w-md">
      <h2 className="text-lg font-semibold mb-3">使い方の案内を見ますか？</h2>
      <p className="text-sm text-base-content/80 mb-1">
        主な機能を約1分でご紹介します。
      </p>
      <p className="text-sm text-base-content/50 mb-4">
        あとから画面右上の「?」ボタンでいつでも見られます。
      </p>
      <div className="flex justify-end gap-2">
        <button
          className="rounded bg-base-200 hover:bg-base-300 px-4 py-2 text-sm"
          onClick={onDecline}
        >
          今は見ない
        </button>
        <button
          className="rounded bg-primary text-primary-content hover:opacity-90 px-4 py-2 text-sm"
          onClick={onAccept}
        >
          見る
        </button>
      </div>
    </GenericModal>
  );
}
