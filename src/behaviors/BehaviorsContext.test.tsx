import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

vi.mock("@zmkfirmware/zmk-studio-ts-client/core", () => ({
  LockState: {
    ZMK_STUDIO_CORE_LOCK_STATE_LOCKED: 0,
    ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED: 1,
  },
}));
vi.mock("../rpc/logging", () => ({
  call_rpc: vi.fn(),
}));

import { call_rpc } from "../rpc/logging";
import {
  BehaviorsProvider,
  useBehaviorMap,
  useBehaviorsLoading,
  useBehaviorsStatus,
  BEHAVIORS_CACHE_KEY,
} from "./BehaviorsContext";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";

const store = new Map<string, string>();

const mockLocalStorage = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
  removeItem: vi.fn((key: string) => { store.delete(key); }),
  clear: vi.fn(() => { store.clear(); }),
  get length() { return store.size; },
  key: vi.fn(() => null),
};

type RpcRequest = {
  behaviors?: {
    listAllBehaviors?: boolean;
    getBehaviorDetails?: { behaviorId: number };
  };
};

function mockDevice(behaviorIds: number[]) {
  vi.mocked(call_rpc).mockImplementation(async (_conn, req) => {
    const r = req as RpcRequest;
    if (r.behaviors?.listAllBehaviors) {
      return {
        behaviors: { listAllBehaviors: { behaviors: behaviorIds } },
      } as never;
    }
    const id = r.behaviors?.getBehaviorDetails?.behaviorId;
    if (id !== undefined) {
      return {
        behaviors: { getBehaviorDetails: { id, displayName: `B${id}` } },
      } as never;
    }
    return {} as never;
  });
}

function detailCallCount(): number {
  return vi
    .mocked(call_rpc)
    .mock.calls.filter(
      (c) => (c[1] as RpcRequest).behaviors?.getBehaviorDetails
    ).length;
}

function Consumer() {
  const map = useBehaviorMap();
  const loading = useBehaviorsLoading();
  const { error, reload } = useBehaviorsStatus();
  return (
    <div>
      <span data-testid="count">{Object.keys(map).length}</span>
      <span data-testid="names">
        {Object.keys(map)
          .map(Number)
          .sort((a, b) => a - b)
          .map((id) => `${id}=${map[id].displayName}`)
          .join(",")}
      </span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{String(error)}</span>
      <button data-testid="reload" onClick={reload}>
        reload
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ConnectionContext.Provider value={{ conn: {} as never }}>
      <LockStateContext.Provider value={1 as never}>
        <BehaviorsProvider>
          <Consumer />
        </BehaviorsProvider>
      </LockStateContext.Provider>
    </ConnectionContext.Provider>
  );
}

async function waitForLoaded() {
  await waitFor(() =>
    expect(screen.getByTestId("loading").textContent).toBe("false")
  );
}

describe("BehaviorsProvider cache", () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
    vi.mocked(call_rpc).mockReset();
  });

  it("fetches every behavior detail when there is no cache, then saves the cache", async () => {
    mockDevice([1, 2, 3]);
    renderProvider();
    await waitForLoaded();

    expect(screen.getByTestId("count").textContent).toBe("3");
    expect(detailCallCount()).toBe(3);

    const cached = JSON.parse(store.get(BEHAVIORS_CACHE_KEY) ?? "null");
    expect(cached.ids).toEqual([1, 2, 3]);
    expect(cached.details).toHaveLength(3);
  });

  it("skips all detail fetches when the cached ids match", async () => {
    store.set(
      BEHAVIORS_CACHE_KEY,
      JSON.stringify({
        ids: [1, 2, 3],
        details: [
          { id: 1, displayName: "B1" },
          { id: 2, displayName: "B2" },
          { id: 3, displayName: "B3" },
        ],
      })
    );
    mockDevice([1, 2, 3]);
    renderProvider();
    await waitForLoaded();

    expect(screen.getByTestId("count").textContent).toBe("3");
    expect(detailCallCount()).toBe(0);
  });

  // Previously this expected one fetch: the entries the old id list still
  // covered were kept and only the new id was asked for. That is what relabelled
  // a customer's whole keymap — behavior ids are per-build, so an id the device
  // still reports can mean something else entirely after a firmware update.
  it("refetches everything when the device reports a different id list", async () => {
    store.set(
      BEHAVIORS_CACHE_KEY,
      JSON.stringify({
        ids: [1, 2],
        details: [
          { id: 1, displayName: "B1" },
          { id: 2, displayName: "B2" },
        ],
      })
    );
    mockDevice([1, 2, 3]);
    renderProvider();
    await waitForLoaded();

    expect(screen.getByTestId("count").textContent).toBe("3");
    expect(detailCallCount()).toBe(3);

    const cached = JSON.parse(store.get(BEHAVIORS_CACHE_KEY) ?? "null");
    expect(cached.ids).toEqual([1, 2, 3]);
  });

  it("never serves a name from a cache the device no longer matches", async () => {
    // The shape that shipped: same id still present, different meaning.
    store.set(
      BEHAVIORS_CACHE_KEY,
      JSON.stringify({
        ids: [1, 2, 3],
        details: [
          { id: 1, displayName: "Caps Word" },
          { id: 2, displayName: "Reset" },
          { id: 3, displayName: "B3" },
        ],
      })
    );
    mockDevice([1, 2, 4]);
    renderProvider();
    await waitForLoaded();

    expect(screen.getByTestId("names").textContent).toBe("1=B1,2=B2,4=B4");
    expect(detailCallCount()).toBe(3);
  });

  it("still reuses the cache when the id list is unchanged", async () => {
    store.set(
      BEHAVIORS_CACHE_KEY,
      JSON.stringify({
        ids: [4, 5],
        details: [
          { id: 4, displayName: "Key Press" },
          { id: 5, displayName: "Transparent" },
        ],
      })
    );
    mockDevice([4, 5]);
    renderProvider();
    await waitForLoaded();

    expect(screen.getByTestId("names").textContent).toBe(
      "4=Key Press,5=Transparent"
    );
    expect(detailCallCount()).toBe(0);
  });

  it("falls back to a full fetch when the cache is corrupt", async () => {
    store.set(BEHAVIORS_CACHE_KEY, "{not json");
    mockDevice([1, 2]);

    renderProvider();
    await waitForLoaded();

    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(detailCallCount()).toBe(2);
  });

  it("sets error instead of loading forever when the device fails, and reload retries", async () => {
    vi.mocked(call_rpc).mockRejectedValue(new Error("boom"));
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toBe("true")
    );
    expect(screen.getByTestId("loading").textContent).toBe("false");

    mockDevice([1]);
    act(() => {
      screen.getByTestId("reload").click();
    });
    await waitForLoaded();

    expect(screen.getByTestId("error").textContent).toBe("false");
    expect(screen.getByTestId("count").textContent).toBe("1");
  });
});
