import { useCallback, useEffect, useMemo, useState } from "react";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";
import { useModalRef } from "./misc/useModalRef";
import { GenericModal } from "./GenericModal";
import type { AvailableDevice } from "./tauri";

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
                  {transport.isWireless ? "BLE" : "USB"}
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

  const haveTransports = useMemo(() => transports.length > 0, [transports]);

  return (
    <GenericModal ref={dialog} className="max-w-xl">
      <div className="flex flex-col items-center gap-3 py-2 mb-4">
        <img src={`${import.meta.env.BASE_URL}zmk.svg`} alt="Logo" className="h-12 rounded" />
        <h1 className="text-xl font-semibold">minimal-keys カスタマイズ</h1>
        <p className="text-sm text-base-content/60 text-center">
          キーボードを接続して設定を始めましょう
        </p>
      </div>
      {haveTransports ? (
        <ConnectOptions
          transports={transports}
          onTransportCreated={onTransportCreated}
          open={open}
        />
      ) : (
        <NoTransportsPrompt />
      )}
    </GenericModal>
  );
};
