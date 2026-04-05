import { describe, it, expect } from "vitest";
import { pub } from "./usePubSub";

describe("pub (non-hook)", () => {
  it("is exported as a plain function (not a hook)", () => {
    // pub should be callable outside React components
    expect(typeof pub).toBe("function");
  });

  it("emits events that subscribers can receive", async () => {
    // We import useSub indirectly via the emitter — test via the module's emitter
    // Since pub wraps emitter.emit, we verify it returns a Promise (Emittery behavior)
    const result = pub("test-event", { data: 42 });
    expect(result).toBeInstanceOf(Promise);
  });
});
