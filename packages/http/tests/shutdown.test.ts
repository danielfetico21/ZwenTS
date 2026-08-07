import { createApp } from "@zwents/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installProcessSignals, listen } from "../index.js";

const handles: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (handles.length > 0) {
    await handles.pop()?.close();
  }
});

describe("app.stop concurrency + timeout", () => {
  it("runs stop hooks only once when stop() is called concurrently", async () => {
    let stops = 0;
    const app = createApp({
      context: {},
      onStop: [
        async () => {
          stops += 1;
          await new Promise((r) => setTimeout(r, 30));
        },
      ],
    });
    await app.start();

    await Promise.all([app.stop(), app.stop(), app.stop()]);
    expect(stops).toBe(1);
    expect(app.started).toBe(false);
  });

  it("clears the stop timer on success (no late STOP_TIMEOUT)", async () => {
    vi.useFakeTimers();
    const app = createApp({ context: {} });
    await app.start();

    const stopPromise = app.stop({ timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(10);
    await stopPromise;
    expect(app.started).toBe(false);

    // Advancing past the original timeout must not throw later.
    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
  });

  it("times out slow stop hooks and allows retry", async () => {
    let attempts = 0;
    const app = createApp({
      context: {},
      onStop: [
        async () => {
          attempts += 1;
          if (attempts === 1) {
            await new Promise((r) => setTimeout(r, 50));
          }
        },
      ],
    });
    await app.start();

    await expect(app.stop({ timeoutMs: 5 })).rejects.toMatchObject({
      code: "STOP_TIMEOUT",
    });
    expect(app.started).toBe(true);

    await app.stop({ timeoutMs: 100 });
    expect(app.started).toBe(false);
    expect(attempts).toBe(2);
  });

  it("does not overlap stop hooks when retrying after STOP_TIMEOUT", async () => {
    let active = 0;
    let maxActive = 0;
    let attempts = 0;
    const app = createApp({
      context: {},
      onStop: [
        async () => {
          attempts += 1;
          active += 1;
          maxActive = Math.max(maxActive, active);
          if (attempts === 1) {
            await new Promise((r) => setTimeout(r, 40));
          }
          active -= 1;
        },
      ],
    });
    await app.start();

    await expect(app.stop({ timeoutMs: 5 })).rejects.toMatchObject({
      code: "STOP_TIMEOUT",
    });
    await app.stop({ timeoutMs: 100 });
    expect(attempts).toBe(2);
    expect(maxActive).toBe(1);
  });
});

describe("listen drain", () => {
  it("waits for in-flight requests before closing", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/slow",
      handler: async () => {
        await gate;
        return { ok: true };
      },
    });

    const handle = await listen(app, {
      port: 0,
      host: "127.0.0.1",
      requestTimeoutMs: 0,
      drainTimeoutMs: 5_000,
    });
    handles.push(handle);

    const pending = fetch(`http://127.0.0.1:${handle.port}/slow`);
    // Allow the request to become in-flight.
    await new Promise((r) => setTimeout(r, 20));
    expect(handle.inflight).toBe(1);

    const closing = handle.close();
    await new Promise((r) => setTimeout(r, 20));
    expect(handle.draining).toBe(true);

    release();
    const res = await pending;
    expect(res.status).toBe(200);
    await closing;
    expect(handle.inflight).toBe(0);
  });

  it("rejects new requests with 503 while draining", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/slow",
      handler: async () => {
        await gate;
        return { ok: true };
      },
    });

    const handle = await listen(app, {
      port: 0,
      host: "127.0.0.1",
      requestTimeoutMs: 0,
      drainTimeoutMs: 5_000,
    });
    handles.push(handle);

    const pending = fetch(`http://127.0.0.1:${handle.port}/slow`);
    await new Promise((r) => setTimeout(r, 20));

    const closing = handle.close();
    await new Promise((r) => setTimeout(r, 10));

    const rejected = await fetch(`http://127.0.0.1:${handle.port}/slow`);
    expect(rejected.status).toBe(503);
    expect(await rejected.json()).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });

    release();
    await pending;
    await closing;
  });

  it("close() is idempotent", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/",
      handler: async () => ({ ok: true }),
    });
    const handle = await listen(app, { port: 0, host: "127.0.0.1" });
    handles.push(handle);

    await handle.close();
    await handle.close();
    expect(handle.draining).toBe(true);
  });

  it("retries close() after a failed server.close", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/",
      handler: async () => ({ ok: true }),
    });
    const handle = await listen(app, { port: 0, host: "127.0.0.1" });
    handles.push(handle);

    const http = await import("node:http");
    const original = http.Server.prototype.close;
    let calls = 0;
    http.Server.prototype.close = function (
      this: InstanceType<typeof http.Server>,
      cb?: (err?: Error) => void,
    ) {
      calls += 1;
      if (calls === 1) {
        queueMicrotask(() => cb?.(new Error("close failed")));
        return this;
      }
      return original.call(this, cb);
    };

    try {
      await expect(handle.close()).rejects.toThrow(/close failed/);
      await handle.close();
      expect(calls).toBe(2);
    } finally {
      http.Server.prototype.close = original;
    }
  });

  it("serializes concurrent close() calls without throwing", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/",
      handler: async () => ({ ok: true }),
    });
    const handle = await listen(app, { port: 0, host: "127.0.0.1" });
    handles.push(handle);

    await Promise.all([handle.close(), handle.close(), handle.close()]);
    expect(handle.draining).toBe(true);
    expect(handle.inflight).toBe(0);
  });

  it("app.stop() drains via onStop hook", async () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/",
      handler: async () => ({ ok: true }),
    });
    const handle = await listen(app, { port: 0, host: "127.0.0.1" });
    // stop closes server; don't also push handle to afterEach double-close races
    await app.stop();
    expect(app.started).toBe(false);
    expect(handle.draining).toBe(true);

    await expect(fetch(`http://127.0.0.1:${handle.port}/`)).rejects.toThrow(
      /fetch|ECONNREFUSED|network/i,
    );
  });
});

describe("installProcessSignals", () => {
  it("stops the app once when multiple signals fire", async () => {
    let stops = 0;
    const exits: number[] = [];
    const app = createApp({
      context: {},
      onStop: [
        async () => {
          stops += 1;
        },
      ],
    });
    await app.start();

    const uninstall = installProcessSignals(app, {
      signals: ["SIGUSR2"],
      exit: (code) => {
        exits.push(code);
      },
    });

    process.emit("SIGUSR2");
    process.emit("SIGUSR2");
    await new Promise((r) => setTimeout(r, 30));

    expect(stops).toBe(1);
    expect(exits).toEqual([0]);
    expect(app.started).toBe(false);
    uninstall();
  });

  it("uninstall removes listeners", async () => {
    const app = createApp({ context: {} });
    await app.start();
    const uninstall = installProcessSignals(app, {
      signals: ["SIGUSR2"],
      exit: false,
    });
    uninstall();
    process.emit("SIGUSR2");
    await new Promise((r) => setTimeout(r, 10));
    expect(app.started).toBe(true);
    await app.stop();
  });

  it("calls process.exit(0) by default after a successful stop", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      return undefined as never;
    }) as typeof process.exit);
    const app = createApp({ context: {} });
    await app.start();
    const uninstall = installProcessSignals(app, { signals: ["SIGUSR2"] });
    process.emit("SIGUSR2");
    await new Promise((r) => setTimeout(r, 30));
    expect(exit).toHaveBeenCalledWith(0);
    exit.mockRestore();
    uninstall();
  });

  it("calls process.exit(1) when stop fails", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      return undefined as never;
    }) as typeof process.exit);
    const app = createApp({
      context: {},
      onStop: [
        async () => {
          throw new Error("stop failed");
        },
      ],
    });
    await app.start();
    const uninstall = installProcessSignals(app, { signals: ["SIGUSR2"] });
    process.emit("SIGUSR2");
    await new Promise((r) => setTimeout(r, 30));
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockRestore();
    uninstall();
  });

  it("fatalErrors stops on unhandledRejection", async () => {
    const kinds: string[] = [];
    const exits: number[] = [];
    const app = createApp({ context: {} });
    await app.start();
    const uninstall = installProcessSignals(app, {
      fatalErrors: true,
      exit: (code) => {
        exits.push(code);
      },
      onFatalError: (_error, kind) => {
        kinds.push(kind);
      },
    });

    process.emit("unhandledRejection", new Error("orphan"), Promise.resolve());
    await new Promise((r) => setTimeout(r, 30));

    expect(kinds).toEqual(["unhandledRejection"]);
    expect(exits).toEqual([1]);
    expect(app.started).toBe(false);
    uninstall();
  });

  it("fatalErrors stops on uncaughtException", async () => {
    const kinds: string[] = [];
    const exits: number[] = [];
    const app = createApp({ context: {} });
    await app.start();
    const uninstall = installProcessSignals(app, {
      fatalErrors: true,
      exit: (code) => {
        exits.push(code);
      },
      onFatalError: (_error, kind) => {
        kinds.push(kind);
      },
    });

    process.emit("uncaughtException", new Error("boom"));
    await new Promise((r) => setTimeout(r, 30));

    expect(kinds).toEqual(["uncaughtException"]);
    expect(exits).toEqual([1]);
    expect(app.started).toBe(false);
    uninstall();
  });
});
