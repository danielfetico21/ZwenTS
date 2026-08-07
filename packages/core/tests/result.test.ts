import { describe, expect, it } from "vitest";
import {
  AppError,
  ErrorCodes,
  andThen,
  appError,
  attempt,
  combine,
  combineAll,
  createApp,
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
  resultToResponse,
  tap,
  tryAsync,
  unwrapOr,
  unwrapOrThrow,
} from "../index.js";

describe("Result helpers", () => {
  it("ok / err / guards", () => {
    const good = ok(1);
    const bad = err("nope");
    expect(isOk(good)).toBe(true);
    expect(isErr(bad)).toBe(true);
    expect(isResult(good)).toBe(true);
    expect(isResult(bad)).toBe(true);
    // Plain domain objects must not look like Result (branded).
    expect(isResult({ ok: true, value: 1 })).toBe(false);
    expect(isResult({ ok: false, error: "x" })).toBe(false);
    expect(isResult(null)).toBe(false);
  });

  it("map / mapErr / andThen / unwrapOr / match", () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(map(err("e"), (n: number) => n * 2)).toEqual(err("e"));
    expect(mapErr(err("e"), (e) => e.toUpperCase())).toEqual(err("E"));
    expect(andThen(ok(2), (n) => ok(String(n)))).toEqual(ok("2"));
    expect(andThen(err("e"), () => ok(1))).toEqual(err("e"));
    expect(unwrapOr(err("e"), 9)).toBe(9);
    expect(
      match(ok(1), {
        ok: (v) => `v=${v}`,
        err: () => "fail",
      }),
    ).toBe("v=1");
  });

  it("fromThrowable / attempt / fromPromise / tryAsync", async () => {
    expect(fromThrowable(() => 1)).toEqual(ok(1));
    expect(
      fromThrowable(
        () => {
          throw new Error("boom");
        },
        (c) => String(c),
      ),
    ).toEqual(err("Error: boom"));
    expect(attempt(() => 3)).toEqual(ok(3));

    await expect(fromPromise(Promise.resolve(5))).resolves.toEqual(ok(5));
    await expect(
      tryAsync(Promise.reject(new Error("x")), (c) =>
        c instanceof Error ? c.message : "?",
      ),
    ).resolves.toEqual(err("x"));
  });

  it("tap / orElse / combine / combineAll / flatten", () => {
    const seen: number[] = [];
    tap(ok(1), (v) => seen.push(v));
    expect(seen).toEqual([1]);
    expect(orElse(err("a"), () => ok(2))).toEqual(ok(2));
    expect(combine([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(combine([ok(1), err("e")])).toEqual(err("e"));
    expect(combineAll([ok(1), err("a"), err("b")])).toEqual(err(["a", "b"]));
    expect(flatten(ok(ok(7)))).toEqual(ok(7));
  });

  it("unwrapOrThrow", () => {
    expect(unwrapOrThrow(ok(1))).toBe(1);
    expect(() => unwrapOrThrow(err(new Error("x")))).toThrow("x");
  });

  it("resultToResponse maps AppError to problem+json", () => {
    const okRes = resultToResponse(ok({ id: 1 }));
    expect(okRes.status).toBe(200);
    expect(okRes.body).toEqual({ id: 1 });

    const bad = resultToResponse(
      err(appError(ErrorCodes.NOT_FOUND, { detail: "missing" })),
    );
    expect(bad.status).toBe(404);
    expect(bad.headers["content-type"]).toContain("problem+json");
  });

  it("handlers may return Result; AppError errors become Problem Details", async () => {
    const app = createApp({ context: {} });
    app.route({
      method: "GET",
      path: "/user/:id",
      handler: async (_ctx, input) => {
        if (input.params["id"] === "missing") {
          return err(
            new AppError(ErrorCodes.NOT_FOUND, 404, { detail: "gone" }),
          );
        }
        return ok({ id: input.params["id"] });
      },
    });

    const good = await app.dispatch({
      method: "GET",
      path: "/user/1",
      headers: {},
    });
    expect(good.status).toBe(200);
    expect(good.body).toEqual({ id: "1" });

    const missing = await app.dispatch({
      method: "GET",
      path: "/user/missing",
      headers: {},
    });
    expect(missing.status).toBe(404);
    expect((missing.body as { detail?: string }).detail).toBe("gone");
  });
});
