import { describe, expect, it } from "vitest";
import { json } from "@zwents/core";
import { memoryIdempotencyStore } from "../index.js";

function expectProceed(
  result: ReturnType<ReturnType<typeof memoryIdempotencyStore>["start"]>,
): number {
  expect(result).toMatchObject({ type: "proceed", lease: expect.any(Number) });
  if (result.type !== "proceed") {
    throw new Error(`expected proceed, got ${result.type}`);
  }
  return result.lease;
}

describe("memoryIdempotencyStore", () => {
  it("rejects waiters when an expired in-flight lock is replaced", async () => {
    const store = memoryIdempotencyStore({ now: () => 0 });
    expectProceed(store.start("k1", "fp1", 100, 0));

    const wait = store.start("k1", "fp1", 100, 0);
    expect(wait.type).toBe("wait");

    expectProceed(store.start("k1", "fp2", 100, 200));

    await expect(
      (wait as Extract<typeof wait, { type: "wait" }>).promise,
    ).rejects.toThrow(/lock expired/);
  });

  it("ignores stale complete/fail after a new lease owns the key", async () => {
    const store = memoryIdempotencyStore({ now: () => 0 });
    const firstLease = expectProceed(store.start("fence", "fp", 50, 0));
    const secondLease = expectProceed(store.start("fence", "fp2", 50, 100));

    // Stale owner must not overwrite the new lease.
    await store.complete("fence", json({ stale: true }, 200), 1000, 100, firstLease);
    expect(store.start("fence", "fp2", 50, 100).type).toBe("wait");

    await store.complete("fence", json({ fresh: true }, 200), 1000, 100, secondLease);
    expect(store.start("fence", "fp2", 50, 100)).toMatchObject({
      type: "replay",
      response: { body: { fresh: true } },
    });
  });

  it("resolves waiters with a one-shot response on fail", async () => {
    const store = memoryIdempotencyStore({ now: () => 0 });
    const lease = expectProceed(store.start("k2", "fp", 1000, 0));
    const wait = store.start("k2", "fp", 1000, 0);
    expect(wait.type).toBe("wait");

    await store.fail("k2", new Error("boom"), json({ ok: true }, 200), lease);

    const res = await (wait as Extract<typeof wait, { type: "wait" }>).promise;
    expect(res.body).toEqual({ ok: true });

    expectProceed(store.start("k2", "fp", 1000, 0));
  });

  it("rejects waiters on fail without a replay response", async () => {
    const store = memoryIdempotencyStore({ now: () => 0 });
    const lease = expectProceed(store.start("k3", "fp", 1000, 0));
    const wait = store.start("k3", "fp", 1000, 0);
    const err = new Error("handler failed");
    await store.fail("k3", err, undefined, lease);

    await expect(
      (wait as Extract<typeof wait, { type: "wait" }>).promise,
    ).rejects.toBe(err);
  });

  it("prunes expired complete records on the next start()", () => {
    const store = memoryIdempotencyStore({ now: () => 0, maxKeys: 1 });
    const a = expectProceed(store.start("a", "fp", 10, 0));
    store.complete("a", json({ n: 1 }, 200), 10, 0, a);
    const b = expectProceed(store.start("b", "fp", 10, 0));
    store.complete("b", json({ n: 2 }, 200), 10, 0, b);

    const next = store.start("c", "fp", 100, 100);
    expect(next.type).toBe("proceed");
  });

  it("evicts oldest complete records to honor maxKeys", () => {
    const store = memoryIdempotencyStore({ now: () => 0, maxKeys: 2 });
    for (const key of ["a", "b"] as const) {
      const lease = expectProceed(store.start(key, "fp", 1000, 0));
      store.complete(key, json({ key }, 200), 1000, 0, lease);
    }
    expect(store.start("c", "fp", 1000, 0).type).toBe("proceed");
    // Oldest complete ("a") was evicted; same fingerprint can proceed again.
    expect(store.start("a", "fp", 1000, 0).type).toBe("proceed");
  });

  it("returns overflow when maxKeys is full of in-flight locks", () => {
    const store = memoryIdempotencyStore({ now: () => 0, maxKeys: 1 });
    expectProceed(store.start("a", "fp", 1000, 0));
    expect(store.start("b", "fp", 1000, 0)).toEqual({ type: "overflow" });
  });

  it("sweeps expired records on an interval without a later start()", async () => {
    let now = 0;
    const store = memoryIdempotencyStore({
      now: () => now,
      sweepIntervalMs: 20,
    });
    const lease = expectProceed(store.start("idle", "fp", 10, 0));
    store.complete("idle", json({ n: 1 }, 200), 10, 0, lease);

    now = 100;
    await new Promise((r) => setTimeout(r, 40));
    // After sweep, the key is free even without another start() prune first.
    expect(store.start("idle", "fp", 1000, now).type).toBe("proceed");
    store.dispose();
  });

  it("prunes abandoned in-flight locks and rejects their waiters", async () => {
    let now = 0;
    const store = memoryIdempotencyStore({ now: () => now });
    expectProceed(store.start("stuck", "fp", 50, now));

    const wait = store.start("stuck", "fp", 50, now);
    expect(wait.type).toBe("wait");

    // Advance past TTL; starting an unrelated key triggers prune of "stuck".
    now = 100;
    expectProceed(store.start("other", "fp", 50, now));

    await expect(
      (wait as Extract<typeof wait, { type: "wait" }>).promise,
    ).rejects.toThrow(/lock expired/);

    // Original key is free again.
    expectProceed(store.start("stuck", "fp", 50, now));
  });
});
