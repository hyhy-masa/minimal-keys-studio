import { ReactNode, useEffect, useRef } from "react";
import { Button } from "react-aria-components";
import { GenericModal } from "./GenericModal";
import { useModalRef } from "./misc/useModalRef";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** When true the confirm button is styled as a destructive (error) action. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A reusable confirmation dialog for destructive/irreversible actions.
 *
 * Built on the same GenericModal + useModalRef pattern as the existing
 * "設定を初期化" confirmation. The caller owns the open state; this component
 * only surfaces the prompt and routes the two outcomes.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "キャンセル",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useModalRef(open);

  // Closing the dialog (parent sets open=false) fires the native <dialog>
  // close event. Without a guard that would call onCancel a second time after
  // a button press. Only an Esc-key close with no prior button press should
  // count as a cancel (outside-click close is intentionally not wired).
  const handledRef = useRef(false);

  useEffect(() => {
    if (open) handledRef.current = false;
  }, [open]);

  const handleConfirm = () => {
    handledRef.current = true;
    onConfirm();
  };

  const handleCancel = () => {
    handledRef.current = true;
    onCancel();
  };

  const handleNativeClose = () => {
    if (handledRef.current) {
      handledRef.current = false;
      return;
    }
    onCancel();
  };

  return (
    <GenericModal ref={ref} onClose={handleNativeClose} className="max-w-[50vw]">
      <h2 className="my-2 text-lg">{title}</h2>
      <div>
        <div className="text-base-content/80">{children}</div>
        <div className="flex justify-end my-2 gap-3">
          <Button
            className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
            onPress={handleCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            className={
              destructive
                ? "rounded bg-error text-error-content hover:opacity-90 px-3 py-2"
                : "rounded bg-base-200 hover:bg-base-300 px-3 py-2"
            }
            onPress={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </GenericModal>
  );
}
