export type AppErrorOptions = {
  detail?: string;
  extras?: Record<string, unknown>;
  cause?: unknown;
  /** Override default status for the code (framework or custom). */
  status?: number;
};

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  extras?: Record<string, unknown>;
};

/** Reserved framework error codes (RFC 0004). */
export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_JSON: "INVALID_JSON",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  CONFIG_ERROR: "CONFIG_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  ALREADY_STARTED: "ALREADY_STARTED",
  STOP_TIMEOUT: "STOP_TIMEOUT",
} as const;

export type FrameworkErrorCode =
  (typeof ErrorCodes)[keyof typeof ErrorCodes];

export type ErrorCode = FrameworkErrorCode | (string & {});

export const DefaultStatus: Record<FrameworkErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_JSON: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  REQUEST_TIMEOUT: 408,
  SERVICE_UNAVAILABLE: 503,
  CONFIG_ERROR: 500,
  INTERNAL_ERROR: 500,
  ALREADY_STARTED: 500,
  STOP_TIMEOUT: 500,
};

export function problemTypeUri(code: string): string {
  return `https://zwents.dev/problems/${code}`;
}

/**
 * Stable application error. Prefer throwing this from services/handlers;
 * the HTTP adapter maps it to Problem Details.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: string;
  readonly extras?: Record<string, unknown>;

  constructor(code: string, status: number, options: AppErrorOptions = {}) {
    super(options.detail ?? code, {
      cause: options.cause,
    });
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.detail = options.detail;
    this.extras = options.extras;
  }

  toProblemDetails(instance?: string): ProblemDetails {
    return {
      type: problemTypeUri(this.code),
      title: this.code,
      status: this.status,
      detail: this.detail,
      instance,
      code: this.code,
      extras: sanitizeExtras(this.extras),
    };
  }
}

/**
 * Drop stack/cause keys and Error values from wire `extras`.
 * `cause` on AppError stays for logs only (never serialized here).
 * Put structured, non-secret fields in `extras` — not Error objects.
 */
export function sanitizeExtras(
  extras: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (!extras) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extras)) {
    if (key === "stack" || key === "cause") continue;
    if (value instanceof Error) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Create an `AppError` using the framework status map when `code` is reserved.
 * Custom codes default to status 500 unless `options.status` is set.
 */
export function appError(code: ErrorCode, options: AppErrorOptions = {}): AppError {
  const fromRegistry =
    code in DefaultStatus
      ? DefaultStatus[code as FrameworkErrorCode]
      : undefined;
  const status = options.status ?? fromRegistry ?? 500;
  return new AppError(code, status, options);
}

export function toProblemDetails(
  error: unknown,
  instance?: string,
): ProblemDetails {
  if (isAppError(error)) {
    return error.toProblemDetails(instance);
  }
  return {
    type: problemTypeUri(ErrorCodes.INTERNAL_ERROR),
    title: ErrorCodes.INTERNAL_ERROR,
    status: 500,
    code: ErrorCodes.INTERNAL_ERROR,
    instance,
  };
}
