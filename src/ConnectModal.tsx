import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bluetooth, ChevronRight, Loader2, Usb } from "lucide-react";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";
import { useModalRef } from "./misc/useModalRef";
import { GenericModal } from "./GenericModal";
import type { AvailableDevice } from "./tauri";
import {
  AutoConnectError,
  autoConnectUsb,
} from "./connect/autoConnectUsb";
import {
  getAutoConnectFailureText,
  usbAutoConnectSearchingText,
} from "./connect/ja";

export type TransportFactory = {
  label: string;
  isWireless?: boolean;
  connect?: () => Promise<RpcTransport>;
  pick_and_connect?: {
    list: () => Promise<Array<AvailableDevice>>;
    connect: (dev: AvailableDevice) => Promise<RpcTransport>;
  };
};

export interface ConnectModalProps {
  open?: boolean;
  transports: TransportFactory[];
  onTransportCreated: (t: RpcTransport, isWireless?: boolean) => void;
}

function SimpleDevicePicker({
  transports,
  onTransportCreated,
}: {
  transports: TransportFactory[];
  onTransportCreated: (t: RpcTransport, isWireless?: boolean) => void;
}) {
  const [selectedTransport, setSelectedTransport] = useState<
    TransportFactory | undefined
  >(undefined);

  useEffect(() => {
    if (!selectedTransport) {
      return;
    }

    let ignore = false;

    async function connectTransport() {
      try {
        const transport = await selectedTransport?.connect?.();

        if (!ignore) {
          if (transport) {
            onTransportCreated(transport, selectedTransport?.isWireless);
          }
          setSelectedTransport(undefined);
        }
      } catch (e) {
        if (!ignore) {
          console.error(e);
          if (e instanceof Error && !(e instanceof UserCancelledError)) {
            alert(e.message);
          }
          setSelectedTransport(undefined);
        }
      }
    }

    connectTransport();

    return () => {
      ignore = true;
    };
  }, [selectedTransport, onTransportCreated]);

  const connections = transports.map((t) => (
    <li key={t.label} className="list-none">
      <button
        className="bg-base-300 hover:bg-primary hover:text-primary-content rounded px-2 py-1"
        type="button"
        onClick={() => setSelectedTransport(t)}
      >
        {t.label}
      </button>
    </li>
  ));
  return (
    <div>
      <p className="text-base">接続方法を選択してください</p>
      <ul className="flex gap-3 pt-3">{connections}</ul>
    </div>
  );
}

function DeviceList({
  open,
  transports,
  onTransportCreated,
}: {
  open: boolean;
  transports: TransportFactory[];
  onTransportCreated: (t: RpcTransport, isWireless?: boolean) => void;
}) {
  const [devices, setDevices] = useState<
    Array<[TransportFactory, AvailableDevice]>
  >([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const loadDevices = useCallback(async () => {
    setRefreshing(true);
    const entries: Array<[TransportFactory, AvailableDevice]> = [];
    for (const t of transports.filter((t) => t.pick_and_connect)) {
      try {
        const devs = await t.pick_and_connect?.list();
        if (!devs) continue;
        entries.push(
          ...devs.map<[TransportFactory, AvailableDevice]>((d) => [t, d])
        );
      } catch (e) {
        console.error(`Failed to list ${t.label} devices:`, e);
      }
    }
    setDevices(entries);
    setSelectedIndex(null);
    setRefreshing(false);
  }, [transports]);

  useEffect(() => {
    if (open) {
      loadDevices();
    }
  }, [open, loadDevices]);

  const connectToSelected = useCallback(async () => {
    if (selectedIndex === null) return;
    const [transport, device] = devices[selectedIndex];
    setConnecting(true);
    try {
      const rpcTransport = await transport.pick_and_connect!.connect(device);
      onTransportCreated(rpcTransport, transport.isWireless);
    } catch (e) {
      console.error("Failed to connect:", e);
      if (e instanceof Error) {
        alert(e.message);
      }
    } finally {
      setConnecting(false);
    }
  }, [selectedIndex, devices, onTransportCreated]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-base">接続するデバイスを選択してください</p>
        <button
          className="bg-base-300 hover:bg-primary hover:text-primary-content rounded px-2 py-1 text-sm"
          type="button"
          onClick={loadDevices}
          disabled={refreshing}
        >
          {refreshing ? "スキャン中..." : "更新"}
        </button>
      </div>
      {devices.length === 0 && !refreshing && (
        <p className="text-base-content/60 text-sm">
          デバイスが見つかりません。キーボードの電源が入っているか確認してください
        </p>
      )}
      {devices.length > 0 && (
        <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto">
          {devices.map(([transport, device], index) => (
            <li key={`${transport.label}-${device.id}`} className="list-none">
              <button
                className={`w-full text-left rounded px-3 py-2 flex items-center gap-2 ${
                  selectedIndex === index
                    ? "bg-primary text-primary-content"
                    : "bg-base-300 hover:bg-base-200"
                }`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                onDoubleClick={() => {
                  setSelectedIndex(index);
                  connectToSelected();
                }}
              >
                <span className="text-xs opacity-60">
                  {transport.isWireless ? "ワイヤレス" : "USB"}
                </span>
                <span>{device.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        className="bg-primary text-primary-content hover:bg-primary/80 rounded px-4 py-2 disabled:opacity-50"
        type="button"
        onClick={connectToSelected}
        disabled={selectedIndex === null || connecting}
      >
        {connecting ? "接続中..." : "接続"}
      </button>
    </div>
  );
}

export type ConnectionMethodView =
  | "choose"
  | "usb-searching"
  | "usb-failed"
  | "manual-usb"
  | "wireless";

export interface ConnectionMethodPanelProps {
  view: ConnectionMethodView;
  failureText?: string;
  onUsbConnect: () => void;
  onWirelessConnect: () => void;
  onShowManualUsb: () => void;
  children?: React.ReactNode;
}

export function ConnectionMethodPanel({
  view,
  failureText,
  onUsbConnect,
  onWirelessConnect,
  onShowManualUsb,
  children,
}: ConnectionMethodPanelProps) {
  const isSearching = view === "usb-searching";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          className="group flex min-h-32 flex-col items-start rounded-lg border border-primary/40 bg-base-200/30 p-4 text-left transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 disabled:cursor-wait disabled:opacity-70"
          type="button"
          onClick={onUsbConnect}
          disabled={isSearching}
        >
          <span className="flex w-full items-center justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-base-100">
              <Usb className="h-5 w-5" aria-hidden="true" />
            </span>
            <ChevronRight className="h-5 w-5 text-base-content/50 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
          <span className="mt-3 text-base font-semibold">USBでつなぐ</span>
          <span className="mt-1 text-sm text-base-content/60">安定して使える、おすすめの方法です</span>
        </button>
        <button
          className="group flex min-h-32 flex-col items-start rounded-lg border border-base-300 bg-base-200/30 p-4 text-left transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
          type="button"
          onClick={onWirelessConnect}
        >
          <span className="flex w-full items-center justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-base-300 text-base-content">
              <Bluetooth className="h-5 w-5" aria-hidden="true" />
            </span>
            <ChevronRight className="h-5 w-5 text-base-content/50 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
          <span className="mt-3 text-base font-semibold">ワイヤレスでつなぐ</span>
          <span className="mt-1 text-sm text-base-content/60">ケーブルを使わずに接続します</span>
        </button>
      </div>

      {isSearching && (
        <div className="flex min-h-16 items-center gap-3 rounded-lg border border-primary/30 bg-base-200/30 px-4 text-sm" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          <span>{usbAutoConnectSearchingText}</span>
        </div>
      )}

      {view === "usb-failed" && failureText && (
        <div className="rounded-lg border border-warning/50 bg-base-200/30 p-4">
          <p className="text-sm leading-6">{failureText}</p>
          <button
            className="mt-3 min-h-11 rounded-md bg-base-300 px-3 text-sm font-medium transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
            type="button"
            onClick={onShowManualUsb}
          >
            手動で選ぶ
          </button>
        </div>
      )}

      {view === "wireless" && (
        <p className="text-sm text-base-content/60">近くのキーボードを選択してください</p>
      )}
      {view === "manual-usb" && (
        <p className="text-sm text-base-content/60">接続するキーボードを手動で選択してください</p>
      )}
      {children}
    </div>
  );
}

function NoTransportsPrompt() {
  return (
    <div className="m-4 flex flex-col gap-2">
      <p>
        お使いのブラウザはWeb Serial / Web Bluetoothに対応していません。Chrome（バージョン89以降）をお使いください。またはデスクトップアプリをご利用ください。
      </p>

      <div>
        <p>minimal-keys カスタマイズを使うには、対応ブラウザまたはデスクトップアプリが必要です。</p>
      </div>
    </div>
  );
}

function ConnectOptions({
  transports,
  onTransportCreated,
  open,
}: {
  transports: TransportFactory[];
  onTransportCreated: (t: RpcTransport, isWireless?: boolean) => void;
  open?: boolean;
}) {
  const useSimplePicker = useMemo(
    () => transports.every((t) => !t.pick_and_connect),
    [transports]
  );

  return useSimplePicker ? (
    <SimpleDevicePicker
      transports={transports}
      onTransportCreated={onTransportCreated}
    />
  ) : (
    <DeviceList
      open={open || false}
      transports={transports}
      onTransportCreated={onTransportCreated}
    />
  );
}

export const ConnectModal = ({
  open,
  transports,
  onTransportCreated,
}: ConnectModalProps) => {
  const dialog = useModalRef(open || false, false, false);
  const [view, setView] = useState<ConnectionMethodView>("choose");
  const [usbFailureText, setUsbFailureText] = useState<string>();
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setView("choose");
      setUsbFailureText(undefined);
    }
    wasOpen.current = open;
  }, [open]);

  const haveTransports = useMemo(() => transports.length > 0, [transports]);

  const wirelessTransports = useMemo(
    () => transports.filter((transport) => transport.isWireless),
    [transports]
  );
  const usbTransports = useMemo(
    () => transports.filter((transport) => !transport.isWireless),
    [transports]
  );

  const handleUsbConnect = useCallback(async () => {
    setUsbFailureText(undefined);
    setView("usb-searching");
    try {
      const { transport } = await autoConnectUsb();
      onTransportCreated(transport);
    } catch (error) {
      const reason = error instanceof AutoConnectError ? error.reason : "no-response";
      setUsbFailureText(getAutoConnectFailureText(reason));
      setView("usb-failed");
    }
  }, [onTransportCreated]);

  const deviceList =
    view === "wireless" ? (
      <ConnectOptions
        transports={wirelessTransports}
        onTransportCreated={onTransportCreated}
        open={open}
      />
    ) : view === "manual-usb" ? (
      <ConnectOptions
        transports={usbTransports}
        onTransportCreated={onTransportCreated}
        open={open}
      />
    ) : undefined;

  return (
    <GenericModal ref={dialog} className="max-w-xl">
      <div className="flex flex-col items-center gap-3 py-2 mb-4">
        <img src={`${import.meta.env.BASE_URL}minimal-keys-logo.png`} alt="Logo" className="h-12 rounded" />
        <h1 className="text-xl font-semibold">minimal-keys カスタマイズ</h1>
        <p className="text-sm text-base-content/60 text-center">
          キーボードを接続して設定を始めましょう
        </p>
      </div>
      {haveTransports ? (
        <ConnectionMethodPanel
          view={view}
          failureText={usbFailureText}
          onUsbConnect={handleUsbConnect}
          onWirelessConnect={() => setView("wireless")}
          onShowManualUsb={() => setView("manual-usb")}
        >
          {deviceList}
        </ConnectionMethodPanel>
      ) : (
        <NoTransportsPrompt />
      )}
    </GenericModal>
  );
};
