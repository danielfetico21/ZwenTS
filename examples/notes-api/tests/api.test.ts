import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNotesApp } from "../app.js";
import { buildContainer } from "../lib/container.js";

const previousDemoAuth = process.env["ALLOW_DEMO_AUTH"];

beforeAll(() => {
  process.env["ALLOW_DEMO_AUTH"] = "1";
});

afterAll(() => {
  if (previousDemoAuth === undefined) {
    delete process.env["ALLOW_DEMO_AUTH"];
  } else {
    process.env["ALLOW_DEMO_AUTH"] = previousDemoAuth;
  }
});

async function authed(userId = "ada") {
  const services = buildContainer();
  const app = createNotesApp(services);
  const tokenRes = await app.dispatch({
    method: "POST",
    path: "/auth/token",
    input: { body: { userId } },
  });
  expect(tokenRes.status).toBe(200);
  const token = (tokenRes.body as { token: string }).token;
  const auth = new Headers({ authorization: `Bearer ${token}` });
  return { app, services, auth, token };
}

describe("notes-api example", () => {
  it("exposes liveness and readiness probes", async () => {
    const services = buildContainer();
    const app = createNotesApp(services);
    const health = await app.dispatch({ method: "GET", path: "/health" });
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok" });

    const ready = await app.dispatch({ method: "GET", path: "/ready" });
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ status: "ready", checks: { db: true } });

    await services.db.close();
    const down = await app.dispatch({ method: "GET", path: "/ready" });
    expect(down.status).toBe(503);
  });

  it("rejects demo token minting when ALLOW_DEMO_AUTH is unset", async () => {
    const saved = process.env["ALLOW_DEMO_AUTH"];
    delete process.env["ALLOW_DEMO_AUTH"];
    try {
      const app = createNotesApp();
      const res = await app.dispatch({
        method: "POST",
        path: "/auth/token",
        input: { body: { userId: "ada" } },
      });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: "FORBIDDEN" });
    } finally {
      process.env["ALLOW_DEMO_AUTH"] = saved ?? "1";
    }
  });

  it("rejects unauthenticated note access", async () => {
    const app = createNotesApp();
    const res = await app.dispatch({ method: "GET", path: "/notes" });
    expect(res.status).toBe(401);
  });

  it("creates, lists, gets, and deletes a note", async () => {
    const { app, auth } = await authed();

    const created = await app.dispatch({
      method: "POST",
      path: "/notes",
      headers: new Headers({
        authorization: auth.get("authorization")!,
        "idempotency-key": "create-1",
        "content-type": "application/json",
      }),
      input: { body: { title: "Hello", body: "world" } },
    });
    expect(created.status).toBe(200);
    const note = created.body as { id: string; title: string };
    expect(note.title).toBe("Hello");

    const replay = await app.dispatch({
      method: "POST",
      path: "/notes",
      headers: new Headers({
        authorization: auth.get("authorization")!,
        "idempotency-key": "create-1",
      }),
      input: { body: { title: "Hello", body: "world" } },
    });
    expect(replay.headers["idempotent-replay"]).toBe("true");
    expect(replay.body).toEqual(created.body);

    const list = await app.dispatch({
      method: "GET",
      path: "/notes",
      headers: auth,
      input: { query: { limit: "10", offset: "0" } },
    });
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      total: 1,
      items: [{ id: note.id }],
      hasMore: false,
    });

    const got = await app.dispatch({
      method: "GET",
      path: `/notes/${note.id}`,
      headers: auth,
    });
    expect(got.status).toBe(200);

    const other = await authed("grace");
    const forbidden = await other.app.dispatch({
      method: "GET",
      path: `/notes/${note.id}`,
      headers: other.auth,
    });
    expect(forbidden.status).toBe(404);

    const deleted = await app.dispatch({
      method: "DELETE",
      path: `/notes/${note.id}`,
      headers: auth,
    });
    expect(deleted.status).toBe(200);
  });

  it("does not replay idempotent creates across users", async () => {
    const ada = await authed("ada");
    const grace = await authed("grace");
    const key = "shared-create-key";
    const body = { title: "Shared title", body: "payload" };

    const adaCreated = await ada.app.dispatch({
      method: "POST",
      path: "/notes",
      headers: new Headers({
        authorization: ada.auth.get("authorization")!,
        "idempotency-key": key,
        "content-type": "application/json",
      }),
      input: { body },
    });
    expect(adaCreated.status).toBe(200);

    const graceCreated = await grace.app.dispatch({
      method: "POST",
      path: "/notes",
      headers: new Headers({
        authorization: grace.auth.get("authorization")!,
        "idempotency-key": key,
        "content-type": "application/json",
      }),
      input: { body },
    });
    expect(graceCreated.status).toBe(200);
    expect(graceCreated.headers["idempotent-replay"]).toBeUndefined();
    expect(graceCreated.body).not.toEqual(adaCreated.body);
    expect((graceCreated.body as { id: string }).id).not.toBe(
      (adaCreated.body as { id: string }).id,
    );
  });

  it("isolates notes per user in list", async () => {
    const ada = await authed("ada");
    const grace = await authed("grace");

    await ada.app.dispatch({
      method: "POST",
      path: "/notes",
      headers: ada.auth,
      input: { body: { title: "Ada note", body: "" } },
    });
    await grace.app.dispatch({
      method: "POST",
      path: "/notes",
      headers: grace.auth,
      input: { body: { title: "Grace note", body: "" } },
    });

    const adaList = await ada.app.dispatch({
      method: "GET",
      path: "/notes",
      headers: ada.auth,
      input: { query: {} },
    });
    expect(adaList.body).toMatchObject({ total: 1 });
    expect((adaList.body as { items: { title: string }[] }).items[0]?.title).toBe(
      "Ada note",
    );
  });
});
