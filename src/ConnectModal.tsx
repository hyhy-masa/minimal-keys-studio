import { useEffect, useMemo, useState } from "react";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";
import { useModalRef } from "./misc/useModalRef";
import { ExternalLink } from "./misc/ExternalLink";
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

function simpleDevicePicker(
  transports: TransportFactory[],
  onTransportCreated: (t: RpcTransport, isWireless?: boolean) => void
) {
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
  }, [selectedTransport]);

  let connections = transports.map((t) => (
    <li key={t.label} className="list-none">
      <button
        className="bg-base-300 hover:bg-primary hover:text-primary-content rounded px-2 py-1"
        type="button"
        onClick={async () => setSelectedTransport(t)}
      >
        {t.label}
      </button>
    </li>
  ));
  return (
    <div>
      <p className="text-base">Select a connection type.</p>
      <ul className="flex gap-3 pt-3">{connections}</ul>
    </div>
  );
}

function deviceList(
  open: boolean,
  transports: TransportFactory[],
  onTransportCreated: (t: RpcTransport, isWireless?: boolean) => void
) {
  const [devices, setDevices] = useState<
    Array<[TransportFactory, AvailableDevice]>
  >([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  async function loadDevices() {
    setRefreshing(true);
    let entries: Array<[TransportFactory, AvailableDevice]> = [];
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
  }

  useEffect(() => {
    if (open) {
      loadDevices();
    }
  }, [open]);

  async function connectToSelected() {
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
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-base">Select a device to connect.</p>
        <button
          className="bg-base-300 hover:bg-primary hover:text-primary-content rounded px-2 py-1 text-sm"
          type="button"
          onClick={loadDevices}
          disabled={refreshing}
        >
          {refreshing ? "Scanning..." : "Refresh"}
        </button>
      </div>
      {devices.length === 0 && !refreshing && (
        <p className="text-base-content/60 text-sm">
          No devices found. Make sure your keyboard is powered on and nearby.
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
        {connecting ? "Connecting..." : "Connect"}
      </button>
    </div>
  );
}

function noTransportsOptionsPrompt() {
  return (
    <div className="m-4 flex flex-col gap-2">
      <p>
        Your browser is not supported. minimal-keys Studio uses either{" "}
        <ExternalLink href="https://caniuse.com/web-serial">
          Web Serial
        </ExternalLink>{" "}
        or{" "}
        <ExternalLink href="https://caniuse.com/web-bluetooth">
          Web Bluetooth
        </ExternalLink>{" "}
        to connect to ZMK devices.
      </p>

      <div>
        <p>To use minimal-keys Studio, use a browser that supports Web Serial or Web Bluetooth (e.g. Chrome/Edge).</p>
      </div>
    </div>
  );
}

function connectOptions(
  transports: TransportFactory[],
  onTransportCreated: (t: RpcTransport, isWireless?: boolean) => void,
  open?: boolean
) {
  const useSimplePicker = useMemo(
    () => transports.every((t) => !t.pick_and_connect),
    [transports]
  );

  return useSimplePicker
    ? simpleDevicePicker(transports, onTransportCreated)
    : deviceList(open || false, transports, onTransportCreated);
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
      <h1 className="text-xl">minimal-keys Studio</h1>
      {haveTransports
        ? connectOptions(transports, onTransportCreated, open)
        : noTransportsOptionsPrompt()}
    </GenericModal>
  );
};
