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
export const BEHAVIORS_CACHE_KEY = "behaviors-cache-v1";

interface BehaviorsCache {
  ids: number[];
  details: GetBehaviorDetailsResponse[];
}

/**
 * The cache is for one firmware build; any change to the id list retires it.
 * A build that keeps the same ids but changes display names or metadata cannot be
 * detected until the firmware exposes a build identifier that can join this cache key.
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
        const reusable = cacheMatchesDevice(cached, behaviorIds);
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
