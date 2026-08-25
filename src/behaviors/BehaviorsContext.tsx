import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { call_rpc } from "../rpc/logging";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

interface BehaviorsState {
  map: BehaviorMap;
  list: GetBehaviorDetailsResponse[];
  loading: boolean;
  error: boolean;
}

interface BehaviorsContextValue extends BehaviorsState {
  reload: () => void;
}

const BehaviorsContext = createContext<BehaviorsContextValue>({
  map: {},
  list: [],
  loading: false,
  error: false,
  reload: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export function useBehaviorMap(): BehaviorMap {
  return useContext(BehaviorsContext).map;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBehaviorList(): GetBehaviorDetailsResponse[] {
  return useContext(BehaviorsContext).list;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBehaviorsLoading(): boolean {
  return useContext(BehaviorsContext).loading;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBehaviorsStatus(): {
  loading: boolean;
  error: boolean;
  reload: () => void;
} {
  const { loading, error, reload } = useContext(BehaviorsContext);
  return { loading, error, reload };
}

// Behavior details are static per firmware build, so they are cached across
// sessions. What makes them safe to reuse is the id list: behavior ids are
// assigned per build and are neither stable nor contiguous across firmware
// versions — one shipped device reports [1,2,3,4,5,35,7,…,34], and a build that
// adds or drops a behavior renumbers the rest. So the cache is only usable when
// the device reports exactly the id list it was written for.
//
// Skipping that check silently relabels the whole keymap: a customer who
// updated firmware had id 4 cached as "Caps Word" from the previous build while
// the new build calls it "Key Press", so every letter key exported as Caps Word
// (146 of them) and every transparent key as Reset (375). The export is a
// faithful record of what the app believed, which is why re-importing it was
// rejected binding by binding — Caps Word takes no parameters, and the keycodes
// carried over were not zero.
// v2 (2026-08-25): every v1 cache is retired on sight. A build that kept the id
// list and changed what the ids mean poisoned caches in the field — one keyboard
// showed "Boot" as the name of every letter key. Bumping the key is the only way
// to reach a cache that is already wrong on a user's disk.
export const BEHAVIORS_CACHE_KEY = "behaviors-cache-v2";

interface BehaviorsCache {
  ids: number[];
  details: GetBehaviorDetailsResponse[];
}

/**
 * The cache is for one firmware build; any change to the id list retires it.
 * Necessary but NOT sufficient: a build that keeps the same ids and changes what
 * they mean passes this check. `probeConfirmsCache` below covers that case.
 */
function cacheMatchesDevice(
  cache: BehaviorsCache | null,
  deviceIds: readonly number[]
): boolean {
  return (
    !!cache &&
    cache.ids.length === deviceIds.length &&
    cache.ids.every((id, index) => id === deviceIds[index])
  );
}

/**
 * Ask the device what one or two behaviours are actually called and compare with what
 * the cache holds. The id list cannot see a build that renumbered nothing but changed
 * meanings, and that is exactly what relabelled every letter key as "Boot" (2026-08-25).
 *
 * Two probes (first and last id), because a reordering that shifts meanings moves many
 * entries at once, so the ends catch it. KNOWN LIMIT: a build that changes only an id in
 * the middle while leaving the first and last identical still passes.
 *
 * A probe that does not answer is NOT a mismatch. Throwing the cache away on a transient
 * RPC failure would make every flaky connection pay for a full re-fetch.
 */
async function probeConfirmsCache(
  conn: RpcConnection,
  cache: BehaviorsCache,
  deviceIds: readonly number[]
): Promise<boolean> {
  const probeIds = Array.from(
    new Set([deviceIds[0], deviceIds[deviceIds.length - 1]].filter((id) => id !== undefined))
  ) as number[];

  for (const behaviorId of probeIds) {
    const held = cache.details.find((d) => d.id === behaviorId);
    if (!held) continue;
    let live;
    try {
      const resp = await call_rpc(conn, {
        behaviors: { getBehaviorDetails: { behaviorId } },
      });
      live = resp?.behaviors?.getBehaviorDetails;
    } catch {
      return true; // unreachable device: keep the cache, do not punish a flaky link
    }
    if (live && live.displayName !== held.displayName) return false;
  }
  return true;
}

function readCache(): BehaviorsCache | null {
  try {
    const raw = localStorage.getItem(BEHAVIORS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BehaviorsCache;
    if (!Array.isArray(parsed?.ids) || !Array.isArray(parsed?.details)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cache: BehaviorsCache): void {
  try {
    localStorage.setItem(BEHAVIORS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

export function BehaviorsProvider({ children }: { children: React.ReactNode }) {
  const connection = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const [state, setState] = useState<BehaviorsState>({
    map: {},
    list: [],
    loading: false,
    error: false,
  });
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (
      !connection.conn ||
      lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setState({ map: {}, list: [], loading: false, error: false });
      return;
    }

    let ignore = false;

    async function load() {
      if (!connection.conn) return;

      setState({ map: {}, list: [], loading: true, error: false });

      try {
        const resp = await call_rpc(connection.conn, {
          behaviors: { listAllBehaviors: true },
        });
        if (ignore) return;

        const behaviorIds = resp.behaviors?.listAllBehaviors?.behaviors ?? [];

        const cached = readCache();
        let reusable = cacheMatchesDevice(cached, behaviorIds);
        if (reusable) {
          reusable = await probeConfirmsCache(
            connection.conn,
            cached!,
            behaviorIds
          );
          if (ignore) return;
        }
        const cachedById = new Map(
          (reusable ? cached!.details : []).map((d) => [d.id, d])
        );

        const map: BehaviorMap = {};
        const missing: number[] = [];
        for (const id of behaviorIds) {
          const hit = cachedById.get(id);
          if (hit) {
            map[id] = hit;
          } else {
            missing.push(id);
          }
        }

        const listInDeviceOrder = () =>
          behaviorIds
            .map((id) => map[id])
            .filter((d): d is GetBehaviorDetailsResponse => !!d);

        // Show whatever the cache already covers before fetching the rest.
        setState({
          map: { ...map },
          list: listInDeviceOrder(),
          loading: missing.length > 0,
          error: false,
        });

        for (const behaviorId of missing) {
          if (ignore) return;
          const detail = await call_rpc(connection.conn!, {
            behaviors: { getBehaviorDetails: { behaviorId } },
          });
          const dets = detail?.behaviors?.getBehaviorDetails;
          if (dets) {
            map[dets.id] = dets;
            if (!ignore) {
              setState({
                map: { ...map },
                list: listInDeviceOrder(),
                loading: true,
                error: false,
              });
            }
          }
        }

        if (!ignore) {
          const list = listInDeviceOrder();
          setState({ map, list, loading: false, error: false });
          writeCache({ ids: [...behaviorIds], details: list });
        }
      } catch (e) {
        console.error("Failed to load behaviors:", e);
        if (!ignore) {
          setState({ map: {}, list: [], loading: false, error: true });
        }
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [connection, lockState, reloadToken]);

  return (
    <BehaviorsContext.Provider value={{ ...state, reload }}>
      {children}
    </BehaviorsContext.Provider>
  );
}
