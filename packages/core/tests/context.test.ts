import { createRequestContext } from "../index.js";
import { describe, expect, it } from "vitest";

describe("createRequestContext", () => {
  it("fills defaults for request id, signal, auth, logger, and respond", () => {
    const ctx = createRequestContext({
      services: { n: 1 },
      method: "GET",
      path: "/",
    });

    expect(ctx.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(ctx.signal.aborted).toBe(false);
    expect(ctx.auth).toBeNull();
    expect(ctx.services).toEqual({ n: 1 });
    expect(ctx.responseHeaders).toEqual({});
    expect(ctx.state).toBeInstanceOf(Map);

    expect(() => ctx.respond({ status: 204, headers: {}, body: null })).not.toThrow();
    ctx.logger.child({ scope: "test" }).debug("silent");
  });

  it("honors explicit request metadata", () => {
    const controller = new AbortController();
    const headers = new Headers({ "x-test": "1" });
    let responded = false;

    const ctx = createRequestContext({
      services: {},
      method: "POST",
      path: "/items",
      headers,
      requestId: "req-1",
      signal: controller.signal,
      auth: { userId: "u1", roles: ["admin"] },
      tenantId: "t1",
      respond: () => {
        responded = true;
      },
    });

    expect(ctx.requestId).toBe("req-1");
    expect(ctx.req.headers.get("x-test")).toBe("1");
    expect(ctx.auth).toEqual({ userId: "u1", roles: ["admin"] });
    expect(ctx.tenantId).toBe("t1");
    ctx.respond({ status: 200, headers: {}, body: {} });
    expect(responded).toBe(true);
  });
});
