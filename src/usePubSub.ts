import Emittery from "emittery";
import { useEffect } from "react";

const emitter = new Emittery();

// Non-hook version for use outside React components
export const pub = (name: PropertyKey, data: unknown) =>
  emitter.emit(name, data);

export const usePub = () => pub;

export const useSub = (
  name: PropertyKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (data: any) => void | Promise<void>
) => {
  const unsub = () => emitter.off(name, callback);

  // Be sure we unsub if unmounted.
  useEffect(() => {
    emitter.on(name, callback);
    return () => unsub();
  });

  return unsub;
};
