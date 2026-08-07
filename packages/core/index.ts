export {
  AppError,
  DefaultStatus,
  ErrorCodes,
  appError,
  isAppError,
  problemTypeUri,
  sanitizeExtras,
  toProblemDetails,
} from "./lib/errors.js";
export type {
  AppErrorOptions,
  ErrorCode,
  FrameworkErrorCode,
  ProblemDetails,
} from "./lib/errors.js";

export type {
  AuthPrincipal,
  Logger,
  RequestContext,
  RequestMeta,
  TraceInfo,
} from "./lib/context.js";
export { createRequestContext } from "./lib/context.js";

export type { ErrorHandler, Middleware, Next } from "./lib/middleware.js";
export { composeMiddleware } from "./lib/middleware.js";

export type {
  DispatchInput,
  Handler,
  HttpMethod,
  RawRouteInput,
  RouteDefinition,
  CompiledRoute,
  RouteMatch,
  RouteMeta,
  UploadedFile,
} from "./lib/route.js";
export { compileRoute, matchRoute } from "./lib/route.js";

export type {
  App,
  AppOptions,
  AppResponse,
  DispatchRequest,
  LifecycleHook,
  StartOptions,
} from "./lib/app.js";
export {
  DISPATCH_INPUT_STATE_KEY,
  createApp,
  getDispatchInput,
  json,
  mergeResponseHeaders,
  problemJson,
  problemResponse,
} from "./lib/app.js";

export type { ErrResult, MapError, OkResult, Result } from "./lib/result.js";
export {
  ResultBrand,
  andTee,
  andThen,
  attempt,
  combine,
  combineAll,
  err,
  flatten,
  fromPromise,
  fromThrowable,
  isErr,
  isOk,
  isResult,
  map,
  mapErr,
  match,
  ok,
  orElse,
  tap,
  toThrowable,
  tryAsync,
  unwrapOr,
  unwrapOrThrow,
} from "./lib/result.js";
export {
  resultToResponse,
  unwrapHandlerResult,
} from "./lib/result-http.js";

export type { ComposeOptions, ProviderMap } from "./lib/compose.js";
export { composeProviders } from "./lib/compose.js";
