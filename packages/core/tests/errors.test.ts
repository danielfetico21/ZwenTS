import { describe, expect, it } from "vitest";
import {
  AppError,
  DefaultStatus,
  ErrorCodes,
  appError,
  problemJson,
  problemResponse,
  problemTypeUri,
  sanitizeExtras,
  toProblemDetails,
} from "../index.js";

describe("AppError", () => {
  it("carries code, status, and detail", () => {
    const error = appError("USER_NOT_FOUND", {
      status: 404,
      detail: "No user with that id",
    });

    expect(error.code).toBe("USER_NOT_FOUND");
    expect(error.status).toBe(404);
    expect(error.detail).toBe("No user with that id");
    expect(error.message).toBe("No user with that id");
  });

  it("maps to Problem Details with zwents type URI", () => {
    const error = new AppError("USER_NOT_FOUND", 404, {
      detail: "missing",
      extras: { userId: "x" },
    });

    expect(error.toProblemDetails("/users/x")).toEqual({
      type: "https://zwents.dev/problems/USER_NOT_FOUND",
      title: "USER_NOT_FOUND",
      status: 404,
      detail: "missing",
      instance: "/users/x",
      code: "USER_NOT_FOUND",
      extras: { userId: "x" },
    });
  });

  it("uses DefaultStatus for framework codes", () => {
    expect(appError(ErrorCodes.FORBIDDEN).status).toBe(
      DefaultStatus.FORBIDDEN,
    );
    expect(problemTypeUri(ErrorCodes.NOT_FOUND)).toBe(
      "https://zwents.dev/problems/NOT_FOUND",
    );
  });

  it("problemJson sets problem+json content type", () => {
    const details = toProblemDetails(appError(ErrorCodes.NOT_FOUND));
    const res = problemJson(details);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.status).toBe(404);
  });

  it("problemResponse builds Problem Details from an error code", () => {
    const res = problemResponse(ErrorCodes.UNAUTHORIZED, "/login", {
      detail: "missing token",
    });
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
      detail: "missing token",
      instance: "/login",
    });
  });

  it("does not serialize cause; strips stack/Error from extras", () => {
    const cause = new Error("secret root");
    const error = appError(ErrorCodes.INTERNAL_ERROR, {
      detail: "failed",
      cause,
      extras: {
        stack: cause.stack,
        cause: "should-not-leak",
        nested: cause,
        userId: "ada",
      },
    });
    const details = error.toProblemDetails("/x");
    expect(details).not.toHaveProperty("cause");
    expect(JSON.stringify(details)).not.toContain("secret root");
    expect(details.extras).toEqual({ userId: "ada" });
    expect(sanitizeExtras({ stack: "x", ok: 1 })).toEqual({ ok: 1 });
  });

  it("maps unknown thrown values without leaking messages", () => {
    expect(toProblemDetails(new Error("db password xyz"))).toEqual({
      type: "https://zwents.dev/problems/INTERNAL_ERROR",
      title: "INTERNAL_ERROR",
      status: 500,
      code: "INTERNAL_ERROR",
      instance: undefined,
    });
  });
});
