import { appError, ErrorCodes, isAppError, type AppError } from "@zwents/core";

export type TimeoutHandle = {
  signal: AbortSignal;
  clear: () => void;
};

/** Map an abort reason to `AppError(REQUEST_TIMEOUT)` unless already an AppError. */
export function abortReasonAsAppError(
  reason: unknown,
  detail = "Request aborted",
): AppError {
  if (isAppError(reason)) return reason;
  return appError(ErrorCodes.REQUEST_TIMEOUT, { detail, cause: reason });
}

/**
 * Combine an optional parent signal with a timeout.
 * Abort reason is `AppError(REQUEST_TIMEOUT)` when the timer fires.
 */
export function createTimeoutSignal(
  timeoutMs: number,
  parent?: AbortSignal,
): TimeoutHandle {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error("@zwents/http: requestTimeoutMs must be a number ≥ 0");
  }

  const controller = new AbortController();

  const abortWith = (reason: unknown): void => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  if (parent?.aborted) {
    abortWith(abortReasonAsAppError(parent.reason));
    return { signal: controller.signal, clear: () => undefined };
  }

  const onParentAbort = (): void => {
    abortWith(abortReasonAsAppError(parent?.reason));
  };
  parent?.addEventListener("abort", onParentAbort, { once: true });

  const timer = setTimeout(() => {
    abortWith(
      appError(ErrorCodes.REQUEST_TIMEOUT, {
        detail: `Request exceeded ${timeoutMs}ms`,
        extras: { timeoutMs },
      }),
    );
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

/** Reject when `signal` aborts (or immediately if already aborted). */
export function whenAborted(signal: AbortSignal): Promise<never> {
  if (signal.aborted) {
    return Promise.reject(abortReasonAsAppError(signal.reason));
  }

  return new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(abortReasonAsAppError(signal.reason));
      },
      { once: true },
    );
  });
}
