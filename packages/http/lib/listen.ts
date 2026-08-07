import {
  ErrorCodes,
  appError,
  problemJson,
  type App,
  type StartOptions,
} from "@zwents/core";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import {
  createFetchHandler,
  toWebResponse,
  type FetchHandlerOptions,
} from "./fetch-handler.js";

export type ListenOptions = StartOptions &
  FetchHandlerOptions & {
    port?: number;
    host?: string;
    /**
     * Max time to wait for in-flight requests during `close()` / `app.stop()`.
     * Defaults to 10_000. Set `0` to close immediately without waiting.
     */
    drainTimeoutMs?: number;
    /**
     * While draining, new requests receive 503 SERVICE_UNAVAILABLE.
     * Defaults to true.
     */
    rejectWhileDraining?: boolean;
  };

export type ListenHandle = {
  port: number;
  host: string;
  /** Close the HTTP server (also registered as an `onStop` hook). */
  close: () => Promise<void>;
  readonly draining: boolean;
  readonly inflight: number;
};

function waitForDrain(
  getInflight: () => number,
  timeoutMs: number,
): Promise<void> {
  if (getInflight() === 0) return Promise.resolve();
  if (timeoutMs <= 0) return Promise.resolve();

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = (): void => {
      if (getInflight() === 0 || Date.now() - startedAt >= timeoutMs) {
        resolve();
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

/**
 * Serve a ZwenTS app over Node HTTP via `@hono/node-server`.
 * Runs `app.start()`, binds the port, and registers drain+close on `app.onStop`.
 * Routing stays in `@zwents/core` — the node adapter only binds the fetch handler.
 */
export async function listen<S>(
  app: App<S>,
  options: ListenOptions = {},
): Promise<ListenHandle> {
  const port = options.port ?? 3000;
  const host = options.host ?? "127.0.0.1";
  const drainTimeoutMs = options.drainTimeoutMs ?? 10_000;
  const rejectWhileDraining = options.rejectWhileDraining ?? true;

  let draining = false;
  let inflight = 0;
  let closed = false;
  let closeInFlight: Promise<void> | null = null;

  const inner = createFetchHandler(app, {
    maxBodyBytes: options.maxBodyBytes,
    multipart: options.multipart,
    requestTimeoutMs: options.requestTimeoutMs,
  });

  const fetchHandler = async (request: Request): Promise<Response> => {
    if (draining && rejectWhileDraining) {
      const details = appError(ErrorCodes.SERVICE_UNAVAILABLE, {
        detail: "Server is shutting down",
      }).toProblemDetails(new URL(request.url).pathname);
      return toWebResponse(problemJson(details, details.status));
    }

    inflight += 1;
    try {
      return await inner(request);
    } finally {
      inflight -= 1;
    }
  };

  await app.start({ port, host });

  const server: ServerType = serve({
    fetch: fetchHandler,
    port,
    hostname: host,
  });

  if (server.address() === null) {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", () => resolve());
      /* v8 ignore start — bind errors usually surface before address() is null */
      server.once("error", (err) => reject(err));
      /* v8 ignore stop */
    });
  }

  const address = server.address();
  const boundPort =
    typeof address === "object" && address !== null ? address.port : port;

  const closeServer = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  const close = (): Promise<void> => {
    if (closed) return Promise.resolve();
    if (closeInFlight) return closeInFlight;

    closeInFlight = (async () => {
      draining = true;
      await waitForDrain(() => inflight, drainTimeoutMs);
      if (closed) return;
      try {
        await closeServer();
        closed = true;
      } catch (error) {
        // Allow a later close() to retry after a failed server.close.
        closeInFlight = null;
        throw error;
      }
    })();

    return closeInFlight;
  };

  app.onStop(close);

  return {
    port: boundPort,
    host,
    close,
    get draining() {
      return draining;
    },
    get inflight() {
      return inflight;
    },
  };
}
