import { useEffect, useRef } from "react";
import { Button } from "react-aria-components";
import { X } from "lucide-react";
import { GenericModal } from "../GenericModal";
import { useModalRef } from "../misc/useModalRef";
import { useFirmwareUpdate } from "./useFirmwareUpdate";
import { useFirmwareVersion } from "./useFirmwareVersion";
import { canCloseStep } from "./machine";
import { stepTitle } from "./ja";
import { WizardBody } from "./WizardBody";

export interface FirmwareUpdateModalProps {
  open: boolean;
  onClose: () => void;
}

export function FirmwareUpdateModal({ open, onClose }: FirmwareUpdateModalProps) {
  const { state, progress, start, cancel, dispatch, recovery } = useFirmwareUpdate();
  const fw = useFirmwareVersion();

  // We drive Escape suppression ourselves (see the `cancel` listener below), so
  // we intentionally do NOT pass useModalRef's allowCancel/reopen path: that
  // reopen() fires the dialog's `close` event, which reaches GenericModal.onClose
  // and desyncs the parent's open flag. (F-5)
  const ref = useModalRef(open);

  // Fresh start every time the modal opens.
  useEffect(() => {
    if (open) dispatch({ type: "RESET" });
  }, [open, dispatch]);

  const handleClose = () => {
    cancel();
    onClose();
  };

  const canClose = canCloseStep(state.step);

  // Native <dialog> lets Escape close the modal even when we hide the X and
  // disable the "中止" button. On any non-dismissable step (canClose=false:
  // downloading / *_confirm / *_bootloader_guide / *_flashing / swap_to_l /
  // verify_checklist / recovery_flashing) that would tear the wizard away
  // mid-flow — worst case during a write. Prevent the dialog's `cancel` event so
  // Escape is a no-op exactly when the on-screen close affordances are hidden. (F-5)
  const canCloseRef = useRef(canClose);
  canCloseRef.current = canClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      if (!canCloseRef.current) e.preventDefault();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [ref]);

  return (
    <GenericModal ref={ref} className="w-[min(560px,92vw)] max-h-[85vh] overflow-y-auto" onClose={handleClose}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{stepTitle[state.step]}</h2>
        {canClose && (
          <Button
            onPress={handleClose}
            aria-label="閉じる"
            className="p-1 rounded hover:bg-base-300"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      <WizardBody
        state={state}
        progress={progress}
        fw={fw}
        dispatch={dispatch}
        cancel={cancel}
        onClose={handleClose}
        start={start}
        recovery={recovery}
      />
    </GenericModal>
  );
}
