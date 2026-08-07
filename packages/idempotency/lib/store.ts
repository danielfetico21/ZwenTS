import type { AppResponse } from "@zwents/core";

export type IdempotencyRecord =
  | {
      status: "complete";
      fingerprint: string;
      response: AppResponse;
      expiresAt: number;
      /** Insertion order for eviction. */
      seq: number;
    }
  | {
      status: "in-flight";
      fingerprint: string;
      expiresAt: number;
      lease: number;
      seq: number;
      waiters: Array<{
        resolve: (response: AppResponse) => void;
        reject: (error: unknown) => void;
      }>;
    };

export type IdempotencyStartResult =
  | { type: "proceed"; lease: number }
  | { type: "replay"; response: AppResponse }
  | { type: "wait"; promise: Promise<AppResponse> }
  | { type: "conflict"; reason: "fingerprint" }
  | { type: "overflow" };

export type IdempotencyStore = {
  start: (
    key: string,
    fingerprint: string,
    ttlMs: number,
    now: number,
  ) => IdempotencyStartResult | Promise<IdempotencyStartResult>;
  complete: (
    key: string,
    response: AppResponse,
    ttlMs: number,
    now: number,
    lease: number,
  ) => void | Promise<void>;
  /**
   * Release an in-flight lock.
   * If `response` is provided, waiters receive a one-shot replay (not persisted).
   */
  fail: (
    key: string,
    error: unknown | undefined,
    response: AppResponse | undefined,
    lease: number,
  ) => void | Promise<void>;
};

export type MemoryIdempotencyStoreOptions = {
  now?: () => number;
  maxKeys?: number;
  /**
   * Optional background prune interval (ms). Defaults to off.
   * The timer is `unref()`'d so it will not keep the process alive alone.
   */
  sweepIntervalMs?: number;
};

export type MemoryIdempotencyStore = IdempotencyStore & {
  /** Stop the optional background sweeper. */
  dispose: () => void;
};

/**
 * In-memory idempotency store (single process).
 * Concurrent same-key requests: first proceeds; others wait for completion.
 */
export function memoryIdempotencyStore(
  options: MemoryIdempotencyStoreOptions = {},
): MemoryIdempotencyStore {
  const records = new Map<string, IdempotencyRecord>();
  const maxKeys = options.maxKeys ?? 10_000;
  const clock = options.now ?? Date.now;
  let seq = 0;
  let leaseSeq = 0;
  let sweepTimer: ReturnType<typeof setInterval> | undefined;

  const pruneExpired = (now: number): void => {
    for (const [key, record] of records) {
      if (record.expiresAt > now) continue;
      if (record.status === "in-flight") {
        for (const waiter of record.waiters) {
          waiter.reject(new Error("Idempotency lock expired"));
        }
      }
      records.delete(key);
    }
  };

  if (
    options.sweepIntervalMs !== undefined &&
    Number.isFinite(options.sweepIntervalMs) &&
    options.sweepIntervalMs > 0
  ) {
    sweepTimer = setInterval(() => {
      pruneExpired(clock());
    }, options.sweepIntervalMs);
    sweepTimer.unref?.();
  }

  const evictOldestComplete = (): boolean => {
    let oldestKey: string | undefined;
    let oldestSeq = Number.POSITIVE_INFINITY;
    for (const [key, record] of records) {
      if (record.status !== "complete") continue;
      if (record.seq < oldestSeq) {
        oldestSeq = record.seq;
        oldestKey = key;
      }
    }
    if (oldestKey === undefined) return false;
    records.delete(oldestKey);
    return true;
  };

  return {
    start(key, fingerprint, ttlMs, now = clock()) {
      pruneExpired(now);

      const existing = records.get(key);
      if (!existing) {
        while (records.size >= maxKeys) {
          if (!evictOldestComplete()) {
            return { type: "overflow" };
          }
        }
        const lease = ++leaseSeq;
        records.set(key, {
          status: "in-flight",
          fingerprint,
          expiresAt: now + ttlMs,
          lease,
          seq: ++seq,
          waiters: [],
        });
        return { type: "proceed", lease };
      }

      if (existing.fingerprint !== fingerprint) {
        return { type: "conflict", reason: "fingerprint" };
      }

      if (existing.status === "complete") {
        return { type: "replay", response: cloneResponse(existing.response) };
      }

      const promise = new Promise<AppResponse>((resolve, reject) => {
        existing.waiters.push({ resolve, reject });
      });
      return { type: "wait", promise };
    },

    complete(key, response, ttlMs, now = clock(), lease) {
      const existing = takeInFlight(records, key, lease);
      if (!existing) return;
      const cloned = cloneResponse(response);
      for (const waiter of existing.waiters) {
        waiter.resolve(cloneResponse(cloned));
      }
      records.set(key, {
        status: "complete",
        fingerprint: existing.fingerprint,
        response: cloned,
        expiresAt: now + ttlMs,
        seq: existing.seq,
      });
    },

    fail(key, error, response, lease) {
      const existing = takeInFlight(records, key, lease);
      if (!existing) return;
      for (const waiter of existing.waiters) {
        if (response) waiter.resolve(cloneResponse(response));
        else waiter.reject(error ?? new Error("Idempotency execution failed"));
      }
      records.delete(key);
    },

    dispose() {
      if (sweepTimer !== undefined) {
        clearInterval(sweepTimer);
        sweepTimer = undefined;
      }
    },
  };
}

function takeInFlight(
  records: Map<string, IdempotencyRecord>,
  key: string,
  lease: number,
): Extract<IdempotencyRecord, { status: "in-flight" }> | undefined {
  const existing = records.get(key);
  if (
    !existing ||
    existing.status !== "in-flight" ||
    existing.lease !== lease
  ) {
    return undefined;
  }
  return existing;
}

function cloneResponse(response: AppResponse): AppResponse {
  return {
    status: response.status,
    headers: { ...response.headers },
    body: cloneBody(response.body),
  };
}

function cloneBody(body: unknown): unknown {
  if (body === null || typeof body !== "object") return body;
  try {
    return structuredClone(body);
  } catch {
    try {
      return JSON.parse(JSON.stringify(body)) as unknown;
    } catch {
      return body;
    }
  }
}
