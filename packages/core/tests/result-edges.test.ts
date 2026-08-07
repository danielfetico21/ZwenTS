import { describe, expect, it } from "vitest";
import {
  combineAll,
  err,
  fromThrowable,
  ok,
  resultToResponse,
  toProblemDetails,
} from "../index.js";

describe("Result and Problem Details edges", () => {
  it("uses defaultMapError when fromThrowable omits mapError", () => {
    const result = fromThrowable(() => {
      throw new Error("raw");
    });
    expect(result).toEqual(err(new Error("raw")));
  });

  it("returns ok from combineAll when every result succeeds", () => {
    expect(combineAll([ok(1), ok(2)])).toEqual(ok([1, 2]));
  });

  it("maps non-AppError failures to INTERNAL_ERROR in resultToResponse", () => {
    const res = resultToResponse(err("plain failure"));
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("maps unknown thrown values via toProblemDetails", () => {
    expect(toProblemDetails("oops")).toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
    });
  });
});
