import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { useConnectedDeviceData } from "./rpc/useConnectedDeviceData";
import { useSub } from "./usePubSub";
import { useContext, useEffect, useState } from "react";
import { useModalRef } from "./misc/useModalRef";
import { LockStateContext } from "./rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { ConnectionContext } from "./rpc/ConnectionContext";
import { ChevronDown, Undo2, Redo2, Save, Trash2, CircleHelp, Download, CircleArrowUp, Bluetooth, Usb } from "lucide-react";
import { useOsMode } from "./OsModeContext";
import { Tooltip } from "./misc/Tooltip";
import { GenericModal } from "./GenericModal";
import { FirmwareUpdateModal } from "./firmware-update/FirmwareUpdateModal";
import { isFirmwareUpdateEnabled } from "./firmware-update/isTauri";
import { checkForUpdate, CURRENT_APP_VERSION, type ReleaseInfo, type UpdateCheckResult } from "./update/versionCheck";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface AppHeaderProps {
  connectedDeviceLabel?: string;
  onSave?: () => void | Promise<void>;
  onDiscard?: () => void | Promise<void>;
  onUndo?: () => Promise<void>;
  onRedo?: () => Promise<void>;
  onResetSettings?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onStartTour?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  // Firmware-update wizard open state is owned by App (lifted for F-6) so that
  // ConnectModal can defer to it. Optional so bare AppHeader renders/tests keep
  // working; the button is a no-op until App wires onFwUpdateOpenChange.
  fwUpdateOpen?: boolean;
  onFwUpdateOpenChange?: (open: boolean) => void;
  isWireless?: boolean;
  availableUpdate?: ReleaseInfo | null;
  firmwareUpdateEnabled?: boolean;
}

export const AppHeader = ({
  connectedDeviceLabel,
  canRedo,
  canUndo,
  onRedo,
  onUndo,
  onSave,
  onDiscard,
  onDisconnect,
  onResetSettings,
  onStartTour,
  fwUpdateOpen = false,
  onFwUpdateOpenChange,
  isWireless,
  availableUpdate,
  firmwareUpdateEnabled,
}: AppHeaderProps) => {
  const [showSettingsReset, setShowSettingsReset] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const fwUpdateEnabled = firmwareUpdateEnabled ?? isFirmwareUpdateEnabled();
  const { osMode, setOsMode } = useOsMode();

  const lockState = useContext(LockStateContext);
  const connectionState = useContext(ConnectionContext);

  useEffect(() => {
    if (
      (!connectionState.conn ||
        lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) &&
      showSettingsReset
    ) {
      setShowSettingsReset(false);
    }
  }, [lockState, showSettingsReset, connectionState.conn]);

  const showSettingsRef = useModalRef(showSettingsReset);
  const [unsaved, setUnsaved] = useConnectedDeviceData<boolean>(
    { keymap: { checkUnsavedChanges: true } },
    (r) => r.keymap?.checkUnsavedChanges
  );

  useSub("rpc_notification.keymap.unsavedChangesStatusChanged", (unsaved) =>
    setUnsaved(unsaved)
  );

  const handleUpdateCheck = async () => {
    setIsCheckingUpdate(true);
    try {
      setUpdateResult(await checkForUpdate());
    } finally {
      setIsCheckingUpdate(false);
    }
  };
  const manualAvailableUpdate = updateResult?.status === "available" ? updateResult.release : null;
  const updateForPopover = availableUpdate ?? manualAvailableUpdate;

  return (
    <header className="top-0 left-0 right-0 grid min-h-12 max-w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center justify-between border-b border-gray-200 bg-white">
      <div className="flex min-w-0 items-center gap-2 overflow-hidden px-3">
        <img src={`${import.meta.env.BASE_URL}minimal-keys-logo.png`} alt="Logo" className="h-8 shrink-0 rounded" />
        <p className="truncate whitespace-nowrap font-semibold text-base">minimal-keys カスタマイズ</p>
      </div>
      <GenericModal ref={showSettingsRef} className="max-w-[50vw]">
        <h2 className="my-2 text-lg">設定を初期化</h2>
        <div>
          <p>
            設定を初期化すると、すべてのキーマップ変更が元に戻ります。続けますか？
          </p>
          <div className="flex justify-end my-2 gap-3">
            <Button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
              onPress={() => setShowSettingsReset(false)}
            >
              キャンセル
            </Button>
            <Button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
              onPress={() => {
                setShowSettingsReset(false);
                onResetSettings?.();
              }}
            >
              設定を初期化
            </Button>
          </div>
        </div>
      </GenericModal>
      {fwUpdateEnabled && (
        <FirmwareUpdateModal
          open={fwUpdateOpen}
          onClose={() => onFwUpdateOpenChange?.(false)}
        />
      )}
      <MenuTrigger>
        <Button
          className="min-h-11 shrink-0 whitespace-nowrap rounded-lg p-1 pl-2 text-center transition-all duration-100 hover:bg-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rac-disabled:opacity-0"
          isDisabled={!connectedDeviceLabel}
        >
          {isWireless === true ? <Bluetooth className="inline-block w-4" aria-label="ワイヤレス" /> : isWireless === false ? <Usb className="inline-block w-4" aria-label="USB" /> : null}
          <span className="w-2 h-2 rounded-full bg-success inline-block" />
          {connectedDeviceLabel}
          <ChevronDown className="inline-block w-4" />
        </Button>
        <Popover>
          <Menu className="shadow-md rounded bg-base-100 text-base-content cursor-pointer overflow-hidden">
            <MenuItem
              className="px-2 py-1 hover:bg-base-200"
              onAction={onDisconnect}
            >
              切断
            </MenuItem>
            <MenuItem
              className="px-2 py-1 hover:bg-base-200"
              onAction={() => setShowSettingsReset(true)}
            >
              設定を初期化
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
      <div className="min-w-0 overflow-x-auto" role="toolbar" aria-label="操作ツールバー">
        <div className="flex min-w-full w-max items-center justify-end gap-1 px-2">
        <div className="mr-2 flex shrink-0 rounded-md bg-base-200 p-0.5" data-tour="os-toggle">
          <button
            className={`min-h-11 min-w-11 shrink-0 rounded px-3 py-1 text-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              osMode === "mac"
                ? "bg-white text-primary font-medium shadow-sm"
                : "text-base-content/50 hover:text-base-content"
            }`}
            onClick={() => setOsMode("mac")}
          >
            Mac
          </button>
          <button
            className={`min-h-11 min-w-11 shrink-0 rounded px-3 py-1 text-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              osMode === "windows"
                ? "bg-white text-primary font-medium shadow-sm"
                : "text-base-content/50 hover:text-base-content"
            }`}
            onClick={() => setOsMode("windows")}
          >
            Windows
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1" data-tour="undo-redo">
          {onUndo && (
            <Tooltip label="元に戻す">
              <Button
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded p-1.5 enabled:hover:bg-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                isDisabled={!canUndo}
                onPress={onUndo}
              >
                <Undo2 className="inline-block w-4 mx-1" aria-label="元に戻す" />
              </Button>
            </Tooltip>
          )}

          {onRedo && (
            <Tooltip label="やり直し">
              <Button
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded p-1.5 enabled:hover:bg-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                isDisabled={!canRedo}
                onPress={onRedo}
              >
                <Redo2 className="inline-block w-4 mx-1" aria-label="やり直し" />
              </Button>
            </Tooltip>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1" data-tour="save-discard">
          <Tooltip label="保存">
            <Button
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded p-1.5 enabled:hover:bg-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
              isDisabled={!unsaved}
              onPress={onSave}
            >
              <Save className="inline-block w-4 mx-1" aria-label="保存" />
            </Button>
          </Tooltip>
          <Tooltip label="破棄">
            <Button
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded p-1.5 enabled:hover:bg-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
              onPress={onDiscard}
              isDisabled={!unsaved}
            >
              <Trash2 className="inline-block w-4 mx-1" aria-label="破棄" />
            </Button>
          </Tooltip>
        </div>
        {fwUpdateEnabled && (
          <Button
            aria-label="ファームウェア更新"
            className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-base-300 px-2 py-1.5 text-sm text-base-content/60 transition-colors enabled:hover:bg-base-200 enabled:hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onPress={() => onFwUpdateOpenChange?.(true)}
          >
            <Download className="inline-block w-4" />
            <span className="whitespace-nowrap">ファーム更新</span>
          </Button>
        )}
        <MenuTrigger>
          <Button
            aria-label={availableUpdate ? "アプリの更新があります" : "アプリ更新"}
            className={`relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center whitespace-nowrap rounded px-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${availableUpdate ? "bg-primary/10 text-primary font-medium" : "text-base-content/50 hover:bg-base-200"}`}
          >
            <CircleArrowUp className="w-4" />
            <span className="ml-1 whitespace-nowrap">{availableUpdate ? "アプリ更新あり" : "アプリ更新"}</span>
            {availableUpdate && <span aria-label="アプリの更新があります" role="status" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-error ring-2 ring-white" />}
          </Button>
          <Popover className="w-72 rounded-lg border border-base-300 bg-base-100 p-3 shadow-md">
            <div className="text-sm">現在のバージョン: {CURRENT_APP_VERSION}</div>
            <div className="my-3 border-t border-base-300" />
            {updateForPopover ? (
              <div className="space-y-2 text-sm">
                <p>新しいバージョン {updateForPopover.tagName} があります</p>
                <button className="min-h-11 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => openUrl(updateForPopover.htmlUrl).catch(() => undefined)}>ダウンロードページを開く</button>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <button className="min-h-11 rounded border border-primary px-3 py-2 text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50" disabled={isCheckingUpdate} onClick={handleUpdateCheck}>{isCheckingUpdate ? "確認中..." : "更新を確認"}</button>
                {updateResult?.status === "latest" && <p>最新版です</p>}
                {updateResult?.status === "error" && <p>確認できませんでした</p>}
              </div>
            )}
          </Popover>
        </MenuTrigger>
        {onStartTour && (
          <Tooltip label="使い方を見る">
            <Button
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded p-1.5 enabled:hover:bg-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onPress={onStartTour}
              aria-label="使い方を見る"
            >
              <CircleHelp className="inline-block w-4 mx-1" />
            </Button>
          </Tooltip>
        )}
        </div>
      </div>
    </header>
  );
};
