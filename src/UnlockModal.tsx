import { useContext, useMemo } from "react";

import { LockStateContext } from "./rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { ConnectionContext } from "./rpc/ConnectionContext";
import { useModalRef } from "./misc/useModalRef";
import { GenericModal } from "./GenericModal";
import { ExternalLink } from "./misc/ExternalLink";

export const UnlockModal = () => {
  const conn = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);

  const open = useMemo(
    () =>
      !!conn.conn && lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED,
    [conn, lockState]
  );
  const dialog = useModalRef(open, false, false);

  return (
    <GenericModal ref={dialog}>
      <h1 className="text-xl">ロック解除してください</h1>
      <p>
        セキュリティのため、キーマップ変更にはロック解除が必要です。
      </p>
      <p>
        キーボードでロック解除キーを押してください。右手と左手の親指キーを同時に押すと解除できます。詳細は{" "}
        <ExternalLink href="https://zmk.dev/docs/keymaps/behaviors/studio-unlock">
          Studio Unlock Behavior
        </ExternalLink>{" "}
        をご参照ください。
      </p>
    </GenericModal>
  );
};
