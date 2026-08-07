import {
  appError,
  ErrorCodes,
  isErr,
  isResult,
  ok,
  type Handler,
  type HttpMethod,
  type Middleware,
  type RawRouteInput,
  type RequestContext,
  type Result,
  type RouteDefinition,
  type UploadedFile,
} from "@zwents/core";
import type { z } from "zod";
import { parseOrThrow } from "./parse.js";

type InferOutput<TOutput extends z.ZodType | undefined> = TOutput extends z.ZodType
  ? z.infer<TOutput>
  : unknown;

type HandlerReturn<T> = T | Result<T, unknown>;

type InferOrUndefined<T> = T extends z.ZodType ? z.infer<T> : undefined;

export type RawBodyMode = "bytes" | "utf8";

export type RouteInput<
  TParams extends z.ZodType | undefined,
  TQuery extends z.ZodType | undefined,
  TBody extends z.ZodType | undefined,
  TRaw extends RawBodyMode | undefined = undefined,
> = {
  params: InferOrUndefined<TParams> extends undefined
    ? Record<string, string>
    : InferOrUndefined<TParams>;
  query: InferOrUndefined<TQuery>;
  body: InferOrUndefined<TBody>;
  /** Present when the HTTP adapter captured raw bytes / `rawBody` is set. */
  raw: TRaw extends "utf8"
    ? string
    : TRaw extends "bytes"
      ? Uint8Array
      : Uint8Array | string | undefined;
  files: readonly UploadedFile[];
};

/** Map of HTTP status → Zod schema for documented error responses. */
export type RouteErrors = Readonly<Record<number, z.ZodType>>;

export type ZodRouteOptions<
  S,
  TParams extends z.ZodType | undefined = undefined,
  TQuery extends z.ZodType | undefined = undefined,
  TBody extends z.ZodType | undefined = undefined,
  TOutput extends z.ZodType | undefined = undefined,
  TRaw extends RawBodyMode | undefined = undefined,
> = {
  method: HttpMethod;
  path: string;
  params?: TParams;
  query?: TQuery;
  body?: TBody;
  output?: TOutput;
  /**
   * Expose the exact request payload on `input.raw`.
   * Use for webhooks (HMAC over raw bytes/utf8). JSON `body` schema still applies when set.
   */
  rawBody?: TRaw;
  /** Documented error bodies for OpenAPI (status → schema). */
  errors?: RouteErrors;
  /**
   * OpenAPI `security` for this operation.
   * Omit to infer from `@zwents/auth` middleware; `false` to disable.
   */
  security?: false | readonly Record<string, string[]>[];
  middleware?: readonly Middleware<S>[];
  tags?: readonly string[];
  handler: (
    ctx: RequestContext<S>,
    input: RouteInput<TParams, TQuery, TBody, TRaw>,
  ) =>
    | Promise<HandlerReturn<InferOutput<TOutput>>>
    | HandlerReturn<InferOutput<TOutput>>;
};

/**
 * Build a core `RouteDefinition` with Zod validation for params/query/body/output.
 * Types for the handler input/output are inferred from the schemas.
 */
export function route<
  S,
  TParams extends z.ZodType | undefined = undefined,
  TQuery extends z.ZodType | undefined = undefined,
  TBody extends z.ZodType | undefined = undefined,
  TOutput extends z.ZodType | undefined = undefined,
  TRaw extends RawBodyMode | undefined = undefined,
>(
  options: ZodRouteOptions<S, TParams, TQuery, TBody, TOutput, TRaw>,
): RouteDefinition<S, RawRouteInput, unknown> {
  const handler: Handler<S, RawRouteInput, unknown> = async (ctx, raw) => {
    const params = options.params
      ? parseOrThrow(options.params, raw.params, "params")
      : raw.params;
    const query = options.query
      ? parseOrThrow(options.query, raw.query ?? {}, "query")
      : undefined;
    const body = options.body
      ? parseOrThrow(options.body, raw.body, "body")
      : undefined;

    let rawValue: Uint8Array | string | undefined = raw.raw;
    if (options.rawBody === "utf8" || options.rawBody === "bytes") {
      if (raw.raw === undefined) {
        throw appError(ErrorCodes.INTERNAL_ERROR, {
          detail:
            "rawBody was requested but the HTTP adapter did not provide raw bytes",
          extras: { location: "raw" },
        });
      }
      rawValue =
        options.rawBody === "utf8"
          ? new TextDecoder().decode(raw.raw)
          : raw.raw;
    }

    const input = {
      params,
      query,
      body,
      raw: rawValue,
      files: raw.files ?? [],
    } as RouteInput<TParams, TQuery, TBody, TRaw>;
    const output = await options.handler(ctx, input);

    if (isResult(output)) {
      if (isErr(output)) return output;
      if (options.output) {
        return ok(parseOrThrow(options.output, output.value, "output"));
      }
      return output;
    }

    if (options.output) {
      return parseOrThrow(options.output, output, "output");
    }
    return output;
  };

  const errors =
    options.errors === undefined
      ? undefined
      : Object.fromEntries(Object.entries(options.errors));

  return {
    method: options.method,
    path: options.path,
    middleware: options.middleware,
    handler,
    meta: {
      tags: options.tags,
      schemas: {
        params: options.params,
        query: options.query,
        body: options.body,
        output: options.output,
      },
      rawBody: options.rawBody,
      security: options.security,
      errors,
    },
  };
}

/**
 * Pin services type `S` once; keep Zod schema inference on each call.
 *
 * @example
 * ```ts
 * const notesRoute = createRoute<AppServices>();
 * app.route(notesRoute({ method: "GET", path: "/notes", … }));
 * ```
 */
export function createRoute<S>() {
  return function routeForServices<
    TParams extends z.ZodType | undefined = undefined,
    TQuery extends z.ZodType | undefined = undefined,
    TBody extends z.ZodType | undefined = undefined,
    TOutput extends z.ZodType | undefined = undefined,
    TRaw extends RawBodyMode | undefined = undefined,
  >(
    options: ZodRouteOptions<S, TParams, TQuery, TBody, TOutput, TRaw>,
  ): RouteDefinition<S, RawRouteInput, unknown> {
    return route(options);
  };
}
