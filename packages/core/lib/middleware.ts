import type { RequestContext } from "./context.js";
import type { AppResponse } from "./response.js";

export type Next = () => Promise<void>;

export type Middleware<S = unknown> = (
  ctx: RequestContext<S>,
  next: Next,
) => Promise<void>;

export type ErrorHandler<S = unknown> = (
  error: unknown,
  ctx: RequestContext<S>,
) => Promise<AppResponse> | AppResponse;

/**
 * Compose middleware left-to-right (Koa/Echo style).
 * Registration order is execution order.
 */
export function composeMiddleware<S>(
  middleware: readonly Middleware<S>[],
): Middleware<S> {
  return async (ctx, next) => {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      const fn = middleware[i];
      if (!fn) {
        await next();
        return;
      }
      await fn(ctx, () => dispatch(i + 1));
    };

    await dispatch(0);
  };
}
