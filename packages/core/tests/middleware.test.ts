import { describe, expect, it } from "vitest";
import {
  composeMiddleware,
  createRequestContext,
  type Middleware,
} from "../index.js";

const doubleNext: Middleware = async (_ctx, next) => {
  await next();
  await next();
};

describe("composeMiddleware", () => {
  it("throws when next() is called twice", async () => {
    const composed = composeMiddleware([doubleNext]);
    const ctx = createRequestContext({
      services: {},
      method: "GET",
      path: "/",
    });

    await expect(composed(ctx, async () => undefined)).rejects.toThrow(
      /next\(\) called multiple times/,
    );
  });

  it("runs middleware in registration order around the terminal next", async () => {
    const order: string[] = [];
    const a: Middleware = async (_ctx, next) => {
      order.push("a:before");
      await next();
      order.push("a:after");
    };
    const b: Middleware = async (_ctx, next) => {
      order.push("b:before");
      await next();
      order.push("b:after");
    };

    await composeMiddleware([a, b])(
      createRequestContext({ services: {}, method: "GET", path: "/" }),
      async () => {
        order.push("done");
      },
    );

    expect(order).toEqual([
      "a:before",
      "b:before",
      "done",
      "b:after",
      "a:after",
    ]);
  });
});
