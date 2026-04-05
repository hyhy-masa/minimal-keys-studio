import { useCallback, useEffect, useState } from "react";
import { Button } from "react-aria-components";
import { SubsystemUnavailable } from "../misc/SubsystemUnavailable";
import { useCustomSubsystem } from "../rpc/useCustomSubsystem";
import { useToast } from "../misc/Toast";
import * as BLE from "../proto/ble";

function rpcWithTimeout(label: string, promise: Promise<Uint8Array>, timeoutMs = 5000): Promise<Uint8Array> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[BLE] RPC timeout: ${label}`)), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}

export function BleManagement() {
  const subsystem = useCustomSubsystem(BLE.SUBSYSTEM_ID);
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<BLE.ProfileInfo[]>([]);
  const [splitInfo, setSplitInfo] = useState<BLE.SplitInfo | null>(null);
  const [outputPriority, setOutputPriority] = useState<BLE.OutputPriority>(0);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [loading, setLoading] = useState(false);

  // Load profiles, split info, output priority
  useEffect(() => {
    if (!subsystem) {
      setProfiles([]);
      setSplitInfo(null);
      return;
    }
    let ignore = false;

    async function load() {
      if (!subsystem) return;
      try {
        const [profilesResp, splitResp, priorityResp] = await Promise.all([
          rpcWithTimeout("getProfiles", subsystem.callRPC(BLE.encodeGetProfiles())),
          rpcWithTimeout("getSplitInfo", subsystem.callRPC(BLE.encodeGetSplitInfo())),
          rpcWithTimeout("getOutputPriority", subsystem.callRPC(BLE.encodeGetOutputPriority())),
        ]);
        if (ignore) return;

        const pd = BLE.decodeResponse(profilesResp);
        if (pd.getProfiles) setProfiles(pd.getProfiles.profiles);

        const sd = BLE.decodeResponse(splitResp);
        if (sd.getSplitInfo) setSplitInfo(sd.getSplitInfo);

        const od = BLE.decodeResponse(priorityResp);
        if (od.getOutputPriority !== undefined)
          setOutputPriority(od.getOutputPriority);
      } catch (e) {
        console.error("[BLE] Failed to load BLE info:", e);
        toast("Failed to load Bluetooth info", "error");
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [subsystem, toast]);

  const refreshProfiles = useCallback(async () => {
    if (!subsystem) return;
    try {
      const resp = BLE.decodeResponse(
        await rpcWithTimeout("getProfiles", subsystem.callRPC(BLE.encodeGetProfiles()))
      );
      if (resp.getProfiles) setProfiles(resp.getProfiles.profiles);
    } catch (e) {
      console.error("[BLE] Failed to refresh profiles:", e);
      toast("Failed to refresh profiles", "error");
    }
  }, [subsystem, toast]);

  const switchProfile = useCallback(
    async (index: number) => {
      if (!subsystem) return;
      setLoading(true);
      try {
        await subsystem.callRPC(BLE.encodeSwitchProfile(index));
        await refreshProfiles();
      } catch (e) {
        console.error("[BLE] Failed to switch profile:", e);
        toast("Failed to switch profile", "error");
      } finally {
        setLoading(false);
      }
    },
    [subsystem, refreshProfiles, toast]
  );

  const unpairProfile = useCallback(
    async (index: number) => {
      if (!subsystem) return;
      if (!confirm(`Unpair profile ${index}?`)) return;
      setLoading(true);
      try {
        await subsystem.callRPC(BLE.encodeUnpairProfile(index));
        await refreshProfiles();
      } catch (e) {
        console.error("[BLE] Failed to unpair profile:", e);
        toast("Failed to unpair profile", "error");
      } finally {
        setLoading(false);
      }
    },
    [subsystem, refreshProfiles, toast]
  );

  const saveName = useCallback(
    async (index: number) => {
      if (!subsystem) return;
      try {
        await subsystem.callRPC(BLE.encodeSetProfileName(index, nameValue));
        await refreshProfiles();
      } catch (e) {
        console.error("[BLE] Failed to set profile name:", e);
        toast("Failed to set profile name", "error");
      }
      setEditingName(null);
    },
    [subsystem, nameValue, refreshProfiles, toast]
  );

  const changeOutputPriority = useCallback(
    async (priority: BLE.OutputPriority) => {
      if (!subsystem) return;
      try {
        await subsystem.callRPC(BLE.encodeSetOutputPriority(priority));
        setOutputPriority(priority);
      } catch (e) {
        console.error("[BLE] Failed to set output priority:", e);
        toast("Failed to set output priority", "error");
      }
    },
    [subsystem, toast]
  );

  if (!subsystem) {
    return (
      <SubsystemUnavailable
        featureName="Bluetooth設定"
        explanation="キーボードのファームウェアがこの機能に対応していないか、接続方法を確認してください。"
        technicalDetails="CONFIG_ZMK_BLE_MANAGEMENT_STUDIO_RPC=y"
      />
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-full">
      <h2 className="text-lg font-semibold">Bluetooth Profiles</h2>

      {/* Output Priority */}
      <section className="flex items-center gap-2">
        <span className="text-sm">Output:</span>
        <Button
          className={`rounded px-3 py-1 text-sm ${outputPriority === BLE.OutputPriority.USB ? "bg-primary text-primary-content" : "bg-base-300"}`}
          onPress={() => changeOutputPriority(BLE.OutputPriority.USB)}
        >
          USB
        </Button>
        <Button
          className={`rounded px-3 py-1 text-sm ${outputPriority === BLE.OutputPriority.BLE ? "bg-primary text-primary-content" : "bg-base-300"}`}
          onPress={() => changeOutputPriority(BLE.OutputPriority.BLE)}
        >
          BLE
        </Button>
      </section>

      {/* Profile List */}
      <section className="flex flex-col gap-2">
        {profiles.map((profile) => (
          <div
            key={profile.index}
            className={`rounded-lg border p-3 flex items-center gap-3 ${
              profile.isActive
                ? "border-primary bg-primary/10"
                : "border-base-300 bg-base-100"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {profile.isActive && (
                  <span className="text-xs bg-primary text-primary-content rounded px-1">
                    Active
                  </span>
                )}
                {profile.isConnected && (
                  <span className="text-xs bg-success text-success-content rounded px-1">
                    Connected
                  </span>
                )}
                {profile.isOpen && (
                  <span className="text-xs bg-warning text-warning-content rounded px-1">
                    Open
                  </span>
                )}
                <span className="text-xs text-base-content/50">
                  #{profile.index}
                </span>
              </div>
              {editingName === profile.index ? (
                <div className="flex gap-1 mt-1">
                  <input
                    type="text"
                    value={nameValue}
                    maxLength={31}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && saveName(profile.index)
                    }
                    className="rounded px-2 py-0.5 bg-base-100 border border-base-300 text-sm flex-1"
                    autoFocus
                  />
                  <Button
                    className="text-xs rounded bg-primary text-primary-content px-2"
                    onPress={() => saveName(profile.index)}
                  >
                    Save
                  </Button>
                  <Button
                    className="text-xs rounded bg-base-300 px-2"
                    onPress={() => setEditingName(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <p
                  className="text-sm font-medium cursor-pointer hover:text-primary mt-1"
                  onClick={() => {
                    setEditingName(profile.index);
                    setNameValue(profile.name);
                  }}
                >
                  {profile.name || `Profile ${profile.index}`}
                </p>
              )}
              {profile.address && (
                <p className="text-xs text-base-content/40 font-mono">
                  {profile.address}
                </p>
              )}
            </div>
            <div className="flex gap-1">
              {!profile.isActive && (
                <Button
                  className="text-xs rounded bg-base-300 hover:bg-base-200 px-2 py-1"
                  isDisabled={loading}
                  onPress={() => switchProfile(profile.index)}
                >
                  Switch
                </Button>
              )}
              {profile.address && (
                <Button
                  className="text-xs rounded bg-error/20 text-error hover:bg-error/30 px-2 py-1"
                  isDisabled={loading}
                  onPress={() => unpairProfile(profile.index)}
                >
                  Unpair
                </Button>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Split Info */}
      {splitInfo && splitInfo.isSplit && (
        <section className="flex flex-col gap-2 pt-2 border-t border-base-300">
          <h3 className="text-sm font-medium text-base-content/70">
            Split Keyboard
          </h3>
          <div className="text-sm">
            <p>
              Role:{" "}
              <span className="font-medium">
                {splitInfo.isCentral ? "Central" : "Peripheral"}
              </span>
            </p>
            <p>
              Peripheral:{" "}
              <span
                className={
                  splitInfo.peripheralConnected
                    ? "text-success"
                    : "text-error"
                }
              >
                {splitInfo.peripheralConnected
                  ? "Connected"
                  : "Not connected"}
              </span>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
