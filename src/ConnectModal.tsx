import { useEffect, useMemo, useState } from "react";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";
import { useModalRef } from "./misc/useModalRef";
import { ExternalLink } from "./misc/ExternalLink";
import { GenericModal } from "./GenericModal";

export type TransportFactory = {
  label: string;
  isWireless?: boolean;
  connect: () => Promise<RpcTransport>;
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
        ? simpleDevicePicker(transports, onTransportCreated)
        : noTransportsOptionsPrompt()}
    </GenericModal>
  );
};
