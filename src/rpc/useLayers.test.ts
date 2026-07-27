import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";

vi.mock("@zmkfirmware/zmk-studio-ts-client/core", () => ({
  LockState: {
    ZMK_STUDIO_CORE_LOCK_STATE_LOCKED: 0,
    ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED: 1,
  },
}));
vi.mock("./logging", () => ({
  call_rpc: vi.fn(),
}));

import { call_rpc } from "./logging";
import { useLayers } from "./useLayers";
import { ConnectionContext } from "./ConnectionContext";
import { LockStateContext } from "./LockStateContext";

function renderUseLayers(conn: object | null, lockState: number) {
  return renderHook(() => useLayers(), {
    wrapper: ({ children }) =>
      createElement(
        ConnectionContext.Provider,
        { value: { conn: conn as never } },
        createElement(
          LockStateContext.Provider,
          { value: lockState as never },
          children
        )
      ),
  });
}

describe("useLayers", () => {
  beforeEach(() => {
    vi.mocked(call_rpc).mockReset();
  });

  it("returns an empty array without a connection", () => {
    const { result } = renderUseLayers(null, 1);

    expect(result.current).toEqual([]);
  });

  it("returns an empty array while locked", () => {
    const { result } = renderUseLayers({}, 0);

    expect(result.current).toEqual([]);
  });

  it("maps the keymap response to display layers", async () => {
    vi.mocked(call_rpc).mockResolvedValue({
      keymap: {
        getKeymap: {
          layers: [
            { id: 8, name: "Base" },
            { id: 12, name: "Mouse" },
          ],
        },
      },
    } as never);

    const { result } = renderUseLayers({}, 1);

    await waitFor(() =>
      expect(result.current).toEqual([
        { id: 8, index: 0, name: "Base" },
        { id: 12, index: 1, name: "Mouse" },
      ])
    );
  });

  it("falls back to a positional name for an unnamed layer", async () => {
    vi.mocked(call_rpc).mockResolvedValue({
      keymap: {
        getKeymap: {
          layers: [{ id: 12, name: "" }],
        },
      },
    } as never);

    const { result } = renderUseLayers({}, 1);

    await waitFor(() =>
      expect(result.current).toEqual([{ id: 12, index: 0, name: "Layer 0" }])
    );
  });
});
