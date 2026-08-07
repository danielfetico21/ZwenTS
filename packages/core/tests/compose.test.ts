import { describe, expect, it } from "vitest";
import { composeProviders } from "../index.js";

describe("composeProviders", () => {
  it("wires factories in order with shared deps", () => {
    const container = composeProviders({
      db: () => ({ url: "postgres://local" }),
      users: (deps) => {
        const db = deps["db"] as { url: string };
        return {
          list: () => [`db:${db.url}`],
        };
      },
    });

    expect(container.db.url).toBe("postgres://local");
    expect(container.users.list()).toEqual(["db:postgres://local"]);
  });

  it("rejects duplicate keys", () => {
    expect(() =>
      composeProviders(
        {
          db: () => 1,
        },
        { seeds: { db: 0 } },
      ),
    ).toThrow(/duplicate key/);
  });
});
