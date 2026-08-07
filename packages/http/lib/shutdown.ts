import type { App } from "@zwents/core";

export type FatalErrorKind = "unhandledRejection" | "uncaughtException";

export type InstallProcessSignalsOptions = {
  /** Defaults to `SIGINT` + `SIGTERM`. */
  signals?: readonly NodeJS.Signals[];
  /** Passed to `app.stop()`. Defaults to 10_000. */
  timeoutMs?: number;
  /**
   * Exit the process after stop. Defaults to true.
   * Set false in tests; provide a custom function to observe the exit code.
   */
  exit?: boolean | ((code: number) => void);
  /** Called when a signal is received (before stop). */
  onSignal?: (signal: NodeJS.Signals) => void;
  /**
   * Also handle `unhandledRejection` / `uncaughtException`:
   * call `onFatalError`, then `app.stop()` and exit(1).
   * Defaults to false (safe for tests/libraries). Enable in process entrypoints.
   */
  fatalErrors?: boolean;
  /** Observability hook before fatal shutdown (log the error). */
  onFatalError?: (error: unknown, kind: FatalErrorKind) => void;
};

/**
 * Wire process signals to `app.stop()` (idempotent under concurrent signals).
 * Optionally also fail-loud on unhandled rejections / uncaught exceptions.
 * Returns an uninstall function that removes the listeners.
 */
export function installProcessSignals<S = unknown>(
  app: App<S>,
  options: InstallProcessSignalsOptions = {},
): () => void {
  const signals = options.signals ?? (["SIGINT", "SIGTERM"] as const);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const exitOpt = options.exit ?? true;
  const fatalErrors = options.fatalErrors ?? false;

  let shuttingDown = false;

  const exitProcess = (code: number): void => {
    if (exitOpt === false) return;
    if (typeof exitOpt === "function") {
      exitOpt(code);
      return;
    }
    process.exit(code);
  };

  const beginShutdown = (exitCode: number): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    void app
      .stop({ timeoutMs })
      .then(() => exitProcess(exitCode))
      .catch(() => exitProcess(1));
  };

  const onSignal = (signal: NodeJS.Signals): void => {
    options.onSignal?.(signal);
    beginShutdown(0);
  };

  const onUnhandledRejection = (reason: unknown): void => {
    options.onFatalError?.(reason, "unhandledRejection");
    beginShutdown(1);
  };

  const onUncaughtException = (error: Error): void => {
    options.onFatalError?.(error, "uncaughtException");
    beginShutdown(1);
  };

  for (const signal of signals) {
    process.on(signal, onSignal);
  }
  if (fatalErrors) {
    process.on("unhandledRejection", onUnhandledRejection);
    process.on("uncaughtException", onUncaughtException);
  }

  return () => {
    for (const signal of signals) {
      process.off(signal, onSignal);
    }
    if (fatalErrors) {
      process.off("unhandledRejection", onUnhandledRejection);
      process.off("uncaughtException", onUncaughtException);
    }
  };
}
