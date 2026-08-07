import { appError, ErrorCodes, isAppError } from "@zwents/core";
import { describe, expect, it, vi } from "vitest";
import { createTimeoutSignal, whenAborted } from "../index.js";

describe("createTimeoutSignal", () => {
  it("rejects negative or non-finite timeouts at construction", () => {
    expect(() => createTimeoutSignal(-1)).toThrow(/must be a number ≥ 0/);
    expect(() => createTimeoutSignal(Number.NaN)).toThrow(/must be a number ≥ 0/);
  });

  it("aborts immediately when parent is already aborted with AppError", () => {
    const parent = new AbortController();
    const reason = appError(ErrorCodes.REQUEST_TIMEOUT, { detail: "parent" });
    parent.abort(reason);

    const handle = createTimeoutSignal(5_000, parent.signal);
    expect(handle.signal.aborted).toBe(true);
    expect(handle.signal.reason).toBe(reason);
    handle.clear();
  });

  it("wraps a non-AppError parent abort reason", () => {
    const parent = new AbortController();
    parent.abort(new Error("upstream"));

    const handle = createTimeoutSignal(5_000, parent.signal);
    expect(handle.signal.aborted).toBe(true);
    expect(isAppError(handle.signal.reason)).toBe(true);
    handle.clear();
  });

  it("fires REQUEST_TIMEOUT when the timer elapses", async () => {
    vi.useFakeTimers();
    const handle = createTimeoutSignal(50);
    const rejection = whenAborted(handle.signal);
    vi.advanceTimersByTime(50);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCodes.REQUEST_TIMEOUT,
    });
    handle.clear();
    vi.useRealTimers();
  });

  it("propagates parent abort while waiting", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const handle = createTimeoutSignal(10_000, parent.signal);
    const rejection = whenAborted(handle.signal);
    parent.abort(appError(ErrorCodes.REQUEST_TIMEOUT, { detail: "cancelled" }));
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCodes.REQUEST_TIMEOUT,
    });
    handle.clear();
    vi.useRealTimers();
  });
});

describe("whenAborted", () => {
  it("rejects immediately when already aborted with AppError", async () => {
    const controller = new AbortController();
    const reason = appError(ErrorCodes.REQUEST_TIMEOUT, { detail: "done" });
    controller.abort(reason);
    await expect(whenAborted(controller.signal)).rejects.toBe(reason);
  });

  it("wraps non-AppError abort reasons", async () => {
    const controller = new AbortController();
    controller.abort("nope");
    await expect(whenAborted(controller.signal)).rejects.toMatchObject({
      code: ErrorCodes.REQUEST_TIMEOUT,
    });
  });
});
