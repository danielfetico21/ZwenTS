import { appError, ErrorCodes } from "@zwents/core";
import { z } from "zod";
import { formatZodIssues } from "./zod-issues.js";

export type OffsetPageQuery = {
  limit: number;
  offset: number;
};

export type CursorPageQuery = {
  limit: number;
  cursor?: string;
};

export type OffsetPage<T> = {
  items: T[];
  limit: number;
  offset: number;
  total?: number;
  hasMore: boolean;
};

export type CursorPage<T> = {
  items: T[];
  limit: number;
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
};

export type OffsetPageQueryOptions = {
  /** Defaults to 20. */
  defaultLimit?: number;
  /** Defaults to 100. */
  maxLimit?: number;
  /** Defaults to 0. */
  defaultOffset?: number;
};

export type CursorPageQueryOptions = {
  /** Defaults to 20. */
  defaultLimit?: number;
  /** Defaults to 100. */
  maxLimit?: number;
  /** Max cursor token length. Defaults to 512. */
  cursorMaxLength?: number;
};

const CURSOR_CHAR = /^[A-Za-z0-9_-]+$/;

function assertLimitBounds(
  defaultLimit: number,
  maxLimit: number,
  label: string,
): void {
  if (!Number.isInteger(defaultLimit) || defaultLimit < 1) {
    throw new Error(`${label}: defaultLimit must be an integer ≥ 1`);
  }
  if (!Number.isInteger(maxLimit) || maxLimit < defaultLimit) {
    throw new Error(`${label}: maxLimit must be an integer ≥ defaultLimit`);
  }
}

/**
 * Zod query schema for offset/limit pagination.
 * Coerces string query params from HTTP adapters.
 */
export function offsetPageQuery(
  options: OffsetPageQueryOptions = {},
): z.ZodType<OffsetPageQuery> {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;
  const defaultOffset = options.defaultOffset ?? 0;
  assertLimitBounds(defaultLimit, maxLimit, "@zwents/schema offsetPageQuery");
  if (!Number.isInteger(defaultOffset) || defaultOffset < 0) {
    throw new Error(
      "@zwents/schema offsetPageQuery: defaultOffset must be an integer ≥ 0",
    );
  }

  return z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(maxLimit)
      .default(defaultLimit),
    offset: z.coerce.number().int().min(0).default(defaultOffset),
  });
}

/**
 * Zod query schema for cursor pagination (`limit` + optional opaque `cursor`).
 */
export function cursorPageQuery(
  options: CursorPageQueryOptions = {},
): z.ZodType<CursorPageQuery> {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;
  const cursorMaxLength = options.cursorMaxLength ?? 512;
  assertLimitBounds(defaultLimit, maxLimit, "@zwents/schema cursorPageQuery");
  if (!Number.isInteger(cursorMaxLength) || cursorMaxLength < 1) {
    throw new Error(
      "@zwents/schema cursorPageQuery: cursorMaxLength must be an integer ≥ 1",
    );
  }

  return z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(maxLimit)
      .default(defaultLimit),
    cursor: z
      .string()
      .max(cursorMaxLength)
      .regex(CURSOR_CHAR, "Invalid cursor")
      .optional(),
  });
}

/** Output schema helper for OpenAPI / `route({ output })`. */
export function offsetPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int().nonnegative().optional(),
    hasMore: z.boolean(),
  });
}

/** Output schema helper for cursor pages. */
export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    limit: z.number().int(),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
}

/**
 * Build an offset page payload.
 * `hasMore` defaults to `offset + items.length < total` when `total` is set,
 * otherwise `items.length === limit` (may over-estimate at exact end).
 */
export function offsetPage<T>(input: {
  items: readonly T[];
  limit: number;
  offset: number;
  total?: number;
  hasMore?: boolean;
}): OffsetPage<T> {
  const items = [...input.items];
  const hasMore =
    input.hasMore ??
    (input.total !== undefined
      ? input.offset + items.length < input.total
      : items.length === input.limit);

  return {
    items,
    limit: input.limit,
    offset: input.offset,
    ...(input.total !== undefined ? { total: input.total } : {}),
    hasMore,
  };
}

/**
 * Build a cursor page payload.
 * Defaults: `hasMore` from `nextCursor != null`; missing cursors become `null`.
 */
export function cursorPage<T>(input: {
  items: readonly T[];
  limit: number;
  nextCursor?: string | null;
  prevCursor?: string | null;
  hasMore?: boolean;
}): CursorPage<T> {
  const nextCursor = input.nextCursor ?? null;
  const prevCursor = input.prevCursor ?? null;
  return {
    items: [...input.items],
    limit: input.limit,
    nextCursor,
    prevCursor,
    hasMore: input.hasMore ?? nextCursor !== null,
  };
}

export type EncodeCursorOptions = {
  /** Max encoded token length. Defaults to 512. */
  maxLength?: number;
};

/** Encode a JSON-serializable cursor payload as base64url. */
export function encodeCursor(
  value: unknown,
  options: EncodeCursorOptions = {},
): string {
  const maxLength = options.maxLength ?? 512;
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch (cause) {
    // Programmer error while building a response — not a client VALIDATION_ERROR.
    throw new Error("@zwents/schema: Cursor payload is not JSON-serializable", {
      cause,
    });
  }
  if (json === undefined) {
    throw new Error("@zwents/schema: Cursor payload is not JSON-serializable");
  }
  const token = Buffer.from(json, "utf8").toString("base64url");
  if (token.length > maxLength) {
    throw new Error(
      `@zwents/schema: Encoded cursor exceeds ${maxLength} characters`,
    );
  }
  return token;
}

/**
 * Decode and validate a base64url cursor with a Zod schema.
 * Rejects CR/LF/NUL, non-base64url charset, and schema mismatches.
 */
export function decodeCursor<T extends z.ZodType>(
  schema: T,
  cursor: string,
  options: EncodeCursorOptions = {},
): z.infer<T> {
  const maxLength = options.maxLength ?? 512;
  if (
    cursor.length === 0 ||
    cursor.length > maxLength ||
    cursor.includes("\r") ||
    cursor.includes("\n") ||
    cursor.includes("\0") ||
    !CURSOR_CHAR.test(cursor)
  ) {
    throw appError(ErrorCodes.VALIDATION_ERROR, {
      detail: "Invalid cursor",
      extras: { location: "cursor" },
    });
  }

  let json: string;
  try {
    json = Buffer.from(cursor, "base64url").toString("utf8");
  } catch (cause) {
    throw appError(ErrorCodes.VALIDATION_ERROR, {
      detail: "Invalid cursor encoding",
      cause,
      extras: { location: "cursor" },
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (cause) {
    throw appError(ErrorCodes.VALIDATION_ERROR, {
      detail: "Invalid cursor payload",
      cause,
      extras: { location: "cursor" },
    });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw appError(ErrorCodes.VALIDATION_ERROR, {
      detail: "Invalid cursor payload",
      extras: {
        location: "cursor",
        issues: formatZodIssues(result.error),
      },
    });
  }
  return result.data;
}
