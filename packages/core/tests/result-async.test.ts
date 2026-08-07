import { describe, expect, it } from "vitest";
import {
  andThenAsync,
  err,
  mapAsync,
  ok,
  safeTry,
} from "../index.js";

describe("ResultAsync helpers", () => {
  it("mapAsync maps success values", async () => {
    await expect(mapAsync(Promise.resolve(ok(2)), (n) => n * 3)).resolves.toEqual(
      ok(6),
    );
    await expect(
      mapAsync(Promise.resolve(err("x")), async () => 1),
    ).resolves.toEqual(err("x"));
  });

  it("mapAsync propagates mapper throws", async () => {
    await expect(
      mapAsync(Promise.resolve(ok(1)), () => {
        throw new Error("map-boom");
      }),
    ).rejects.toThrow("map-boom");
  });

  it("andThenAsync chains Results", async () => {
    await expect(
      andThenAsync(Promise.resolve(ok(2)), (n) => ok(n + 1)),
    ).resolves.toEqual(ok(3));
    await expect(
      andThenAsync(Promise.resolve(ok(2)), async (n) =>
        n > 0 ? ok("yes") : err("no"),
      ),
    ).resolves.toEqual(ok("yes"));
    await expect(
      andThenAsync(Promise.resolve(err("e")), () => ok(1)),
    ).resolves.toEqual(err("e"));
  });

  it("andThenAsync returns err from chained fn", async () => {
    await expect(
      andThenAsync(Promise.resolve(ok(1)), () => err("nope")),
    ).resolves.toEqual(err("nope"));
  });

  it("safeTry returns Result and maps throws", async () => {
    await expect(safeTry(async () => ok("ok"))).resolves.toEqual(ok("ok"));
    await expect(
      safeTry(async () => {
        throw new Error("boom");
      }, (cause) => (cause as Error).message),
    ).resolves.toEqual(err("boom"));
  });

  it("safeTry returns err without throwing", async () => {
    await expect(
      safeTry(async () => err("soft")),
    ).resolves.toEqual(err("soft"));
  });

  it("safeTry uses default mapError when omitted", async () => {
    const cause = new Error("raw");
    await expect(
      safeTry(async () => {
        throw cause;
      }),
    ).resolves.toEqual(err(cause));
  });
});
