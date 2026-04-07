import { AppHeader } from "./AppHeader";
import {
  Grid3x3,
  Timer,
  RotateCw,
  MousePointer2,
  Bluetooth,
  BatteryMedium,
  SlidersHorizontal,
} from "lucide-react";

import { create_rpc_connection } from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "./rpc/logging";

import type { Notification } from "@zmkfirmware/zmk-studio-ts-client/studio";
import { ConnectionState, ConnectionContext } from "./rpc/ConnectionContext";
import { Dispatch, useCallback, useEffect, useState } from "react";
import { ConnectModal, TransportFactory } from "./ConnectModal";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { connect as serial_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import { connect as gatt_connect } from "./transport/gatt";
import {
  connect as tauri_ble_connect,
  list_devices as ble_list_devices,
} from "./tauri/ble";
import {
  connect as tauri_serial_connect,
  list_devices as serial_list_devices,
} from "./tauri/serial";
import Keyboard from "./keyboard/Keyboard";
import { TrackballSettings } from "./trackball/TrackballSettings";
import { EncoderSettings } from "./encoder/EncoderSettings";
import { BleManagement } from "./bluetooth/BleManagement";
import { BatteryHistory } from "./battery/BatteryHistory";
import { DeviceSettings } from "./settings/DeviceSettings";
import { HoldTapSettings } from "./holdtap/HoldTapSettings";
import { BehaviorsProvider } from "./behaviors/BehaviorsContext";
import { CustomSubsystemsProvider } from "./rpc/useCustomSubsystem";
import { UndoRedoContext, useUndoRedo } from "./undoRedo";
import { pub, useSub } from "./usePubSub";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { LockStateContext } from "./rpc/LockStateContext";
import { UnlockModal } from "./UnlockModal";
import { valueAfter } from "./misc/async";
import { AppFooter } from "./AppFooter";
import { AboutModal } from "./AboutModal";
import { LicenseNoticeModal } from "./misc/LicenseNoticeModal";
import { ToastProvider, useToast } from "./misc/Toast";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: object;
  }
}

const TRANSPORTS: TransportFactory[] = [
  // Tauri native transports (pick_and_connect pattern)
  ...(window.__TAURI_INTERNALS__
    ? [
        {
          label: "BLE",
          isWireless: true,
          pick_and_connect: {
            list: ble_list_devices,
            connect: tauri_ble_connect,
          },
        },
        {
          label: "USB",
          pick_and_connect: {
            list: serial_list_devices,
            connect: tauri_serial_connect,
          },
        },
      ]
    : []),
  // Browser Web Serial (only when not in Tauri)
  ...(!window.__TAURI_INTERNALS__ && navigator.serial
    ? [{ label: "USB", connect: serial_connect }]
    : []),
  // Browser Web Bluetooth (only when not in Tauri)
  ...(!window.__TAURI_INTERNALS__ && navigator.bluetooth
    ? [{ label: "BLE", isWireless: true, connect: gatt_connect }]
    : []),
].filter((t) => t !== undefined);

async function listen_for_notifications(
  notification_stream: ReadableStream<Notification>,
  signal: AbortSignal
): Promise<void> {
  const reader = notification_stream.getReader();
  const onAbort = () => {
    reader.cancel();
    reader.releaseLock();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  for (;;) {
    try {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      pub("rpc_notification", value);

      const subsystem = Object.entries(value).find(
        ([, v]) => v !== undefined
      );
      if (!subsystem) {
        continue;
      }

      const [subId, subData] = subsystem;
      const event = Object.entries(subData).find(([, v]) => v !== undefined);

      if (!event) {
        continue;
      }

      const [eventName, eventData] = event;
      const topic = ["rpc_notification", subId, eventName].join(".");

      pub(topic, eventData);
    } catch (e) {
      signal.removeEventListener("abort", onAbort);
      reader.releaseLock();
      throw e;
    }
  }

  signal.removeEventListener("abort", onAbort);
  reader.releaseLock();
  notification_stream.cancel();
}

async function connect(
  transport: RpcTransport,
  setConn: Dispatch<ConnectionState>,
  setConnectedDeviceName: Dispatch<string | undefined>,
  signal: AbortSignal,
  onError: (msg: string) => void,
  isWireless?: boolean
) {
  const conn = await create_rpc_connection(transport, { signal });

  const timeout = isWireless ? 5000 : 1000;

  const details = await Promise.race([
    call_rpc(conn, { core: { getDeviceInfo: true } })
      .then((r) => r?.core?.getDeviceInfo)
      .catch(() => undefined),
    valueAfter(undefined, timeout),
  ]);

  if (!details) {
    onError("Failed to connect to the chosen device");
    return;
  }

  listen_for_notifications(conn.notification_readable, signal)
    .then(() => {
      setConnectedDeviceName(undefined);
      setConn({ conn: null });
    })
    .catch(() => {
      setConnectedDeviceName(undefined);
      setConn({ conn: null });
    });

  setConnectedDeviceName(details.name);
  setConn({ conn });
}

type ActiveTab = "keymap" | "trackball" | "encoder" | "bluetooth" | "battery" | "holdtap" | "settings";

type TabDef = { id: ActiveTab; label: string; icon: React.ReactNode };
type TabGroup = { tabs: TabDef[] };

const TAB_GROUPS: TabGroup[] = [
  {
    tabs: [
      { id: "keymap", label: "キーマップ", icon: <Grid3x3 className="w-4 h-4" /> },
      { id: "holdtap", label: "長押し設定", icon: <Timer className="w-4 h-4" /> },
      { id: "encoder", label: "エンコーダー", icon: <RotateCw className="w-4 h-4" /> },
    ],
  },
  {
    tabs: [
      { id: "trackball", label: "トラックボール", icon: <MousePointer2 className="w-4 h-4" /> },
      { id: "bluetooth", label: "Bluetooth", icon: <Bluetooth className="w-4 h-4" /> },
      { id: "battery", label: "バッテリー", icon: <BatteryMedium className="w-4 h-4" /> },
      { id: "settings", label: "設定", icon: <SlidersHorizontal className="w-4 h-4" /> },
    ],
  },
];

function AppInner() {
  const { toast } = useToast();
  const [conn, setConn] = useState<ConnectionState>({ conn: null });
  const [connectedDeviceName, setConnectedDeviceName] = useState<
    string | undefined
  >(undefined);
  const [doIt, undo, redo, canUndo, canRedo, reset] = useUndoRedo();
  const [showAbout, setShowAbout] = useState(false);
  const [showLicenseNotice, setShowLicenseNotice] = useState(false);
  const [connectionAbort, setConnectionAbort] = useState(new AbortController());
  const [activeTab, setActiveTab] = useState<ActiveTab>("keymap");
  const [mountedTabs, setMountedTabs] = useState<Set<ActiveTab>>(new Set(["keymap"]));
  const [keymapVersion, setKeymapVersion] = useState(0);

  const [lockState, setLockState] = useState<LockState>(
    LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED
  );

  useSub("rpc_notification.core.lockStateChanged", (ls) => {
    setLockState(ls);
  });

  useEffect(() => {
    if (!conn) {
      reset();
      setLockState(LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED);
      setMountedTabs(new Set(["keymap"]));
      setActiveTab("keymap");
    }

    async function updateLockState() {
      if (!conn.conn) {
        return;
      }

      const locked_resp = await call_rpc(conn.conn, {
        core: { getLockState: true },
      });

      setLockState(
        locked_resp.core?.getLockState ||
          LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED
      );
    }

    updateLockState();
  }, [conn, setLockState, reset]);

  const save = useCallback(() => {
    async function doSave() {
      if (!conn.conn) {
        return;
      }

      const resp = await call_rpc(conn.conn, { keymap: { saveChanges: true } });
      if (!resp.keymap?.saveChanges || resp.keymap?.saveChanges.err) {
        toast("Failed to save changes", "error");
      } else {
        toast("Changes saved", "success");
      }
    }

    doSave();
  }, [conn, toast]);

  const discard = useCallback(() => {
    async function doDiscard() {
      if (!conn.conn) {
        return;
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { discardChanges: true },
      });
      if (!resp.keymap?.discardChanges) {
        toast("Failed to discard changes", "error");
      } else {
        toast("Changes discarded", "info");
      }

      reset();
      // Re-mount Keyboard to re-fetch keymap (don't use setConn — it clears ALL data)
      setKeymapVersion((v) => v + 1);
    }

    doDiscard();
  }, [conn, toast, reset]);

  const resetSettings = useCallback(() => {
    async function doReset() {
      if (!conn.conn) {
        return;
      }

      const resp = await call_rpc(conn.conn, {
        core: { resetSettings: true },
      });
      if (!resp.core?.resetSettings) {
        toast("Failed to reset settings", "error");
      } else {
        toast("Settings reset", "success");
      }

      reset();
      setKeymapVersion((v) => v + 1);
    }

    doReset();
  }, [conn, toast, reset]);

  const disconnect = useCallback(() => {
    async function doDisconnect() {
      if (!conn.conn) {
        return;
      }

      await conn.conn.request_writable.close();
      connectionAbort.abort("User disconnected");
      setConnectionAbort(new AbortController());
    }

    doDisconnect();
  }, [conn, connectionAbort]);

  const onConnect = useCallback(
    (t: RpcTransport, isWireless?: boolean) => {
      const ac = new AbortController();
      setConnectionAbort(ac);
      connect(t, setConn, setConnectedDeviceName, ac.signal, (msg) => toast(msg, "error"), isWireless);
    },
    [setConn, setConnectedDeviceName, toast]
  );

  return (
    <ConnectionContext.Provider value={conn}>
      <LockStateContext.Provider value={lockState}>
        <UndoRedoContext.Provider value={doIt}>
          <BehaviorsProvider>
          <CustomSubsystemsProvider>
          <UnlockModal />
          <ConnectModal
            open={!conn.conn}
            transports={TRANSPORTS}
            onTransportCreated={onConnect}
          />
          <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
          <LicenseNoticeModal
            open={showLicenseNotice}
            onClose={() => setShowLicenseNotice(false)}
          />
          <div className="bg-base-100 text-base-content h-full max-h-[100vh] w-full max-w-[100vw] inline-grid grid-cols-[auto] grid-rows-[auto_auto_1fr_auto] overflow-hidden">
            <AppHeader
              connectedDeviceLabel={connectedDeviceName}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              onSave={save}
              onDiscard={discard}
              onDisconnect={disconnect}
              onResetSettings={resetSettings}
            />
            {conn.conn && (
              <nav className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-1">
                {TAB_GROUPS.map((group, gi) => (
                  <div key={gi} className="flex items-center gap-0.5">
                    {gi > 0 && <div className="w-px h-6 bg-gray-300 mx-2" />}
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all ${
                          activeTab === tab.id
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-base-content/60 hover:text-base-content hover:bg-base-200"
                        }`}
                        onClick={() => {
                          setActiveTab(tab.id);
                          setMountedTabs((prev) => new Set(prev).add(tab.id));
                        }}
                      >
                        {tab.icon}
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            )}
            <div className="min-h-0 overflow-hidden h-full">
              <div className={activeTab === "keymap" ? "h-full" : "hidden"}><Keyboard key={keymapVersion} /></div>
              {mountedTabs.has("trackball") && <div className={activeTab === "trackball" ? "h-full" : "hidden"}><TrackballSettings /></div>}
              {mountedTabs.has("encoder") && <div className={activeTab === "encoder" ? "h-full" : "hidden"}><EncoderSettings /></div>}
              {mountedTabs.has("bluetooth") && <div className={activeTab === "bluetooth" ? "h-full" : "hidden"}><BleManagement /></div>}
              {mountedTabs.has("holdtap") && <div className={activeTab === "holdtap" ? "h-full" : "hidden"}><HoldTapSettings /></div>}
              {mountedTabs.has("battery") && <div className={activeTab === "battery" ? "h-full" : "hidden"}><BatteryHistory /></div>}
              {mountedTabs.has("settings") && <div className={activeTab === "settings" ? "h-full" : "hidden"}><DeviceSettings /></div>}
            </div>
            <AppFooter
              onShowAbout={() => setShowAbout(true)}
              onShowLicenseNotice={() => setShowLicenseNotice(true)}
            />
          </div>
        </CustomSubsystemsProvider>
        </BehaviorsProvider>
        </UndoRedoContext.Provider>
      </LockStateContext.Provider>
    </ConnectionContext.Provider>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

export default App;
