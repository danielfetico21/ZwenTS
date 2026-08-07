# Database recipe (no ORM in ZwenTS)

ZwenTS **does not** ship or wrap an ORM (RFC 0001 NG2). Wire your driver in the composition root and close it on `onStop`. Migrations live in the **app**.

## Pattern (same as `examples/notes-api`)

```
buildContainer()          // hand-written or zwen gen:wire from wire.ts
  ├─ createDb / pool
  ├─ createNotesRepo(db)
  └─ createNotesService(repo)
         ↑
createApp({ context: services, onStop: [() => db.close()] })
```

Optional: declare the graph in `wire.ts` with `defineWire` / `wire` and run `zwen gen:wire` ([RFC 0005](./rfcs/0005-wire-codegen.md)).

- Handlers call **services**, not SQL
- Repos talk to the DB
- `Result` / `AppError` at the service boundary
- Expose `db.ping()` for [`/ready`](./health-recipe.md)

## Production shape (pg pool)

```ts
import pg from "pg";

export type Db = {
  pool: pg.Pool;
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
};

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return {
    pool,
    async ping() {
      const client = await pool.connect();
      try {
        await client.query("select 1");
        return true;
      } catch {
        return false;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

// createApp({ context: services, onStop: [() => services.db.close()] })
```

## Drizzle / Kysely / Prisma

Same composition: construct in `buildContainer()`, inject into repos, `onStop` → `pool.end()` / `$disconnect()` / `destroy()`.

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle(pool);
  return {
    db,
    pool,
    async ping() {
      try {
        await pool.query("select 1");
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await pool.end();
    },
  };
}
```

## Migrations (in the app)

Run migrations as a **separate process** (or one-shot Job) before flipping traffic — not inside every `listen()`:

```bash
# examples — pick one toolchain in your app
pnpm drizzle-kit migrate
# or: node dist/migrate.js
```

Keep SQL/schema under `app/db/migrations` (or Drizzle `drizzle/`). Framework packages never own migration runners.

## Transactions

Pass an explicit transaction handle down — do **not** use request-scoped DI:

```ts
await db.transaction(async (tx) => {
  await notesRepo.insert(tx, row);
  await auditRepo.insert(tx, event);
});
```

## What to put in ZwenTS vs app code

| In framework / packages | In your app |
|-------------------------|-------------|
| `createApp`, middleware, `Result` | `buildContainer`, repos, migrations |
| Auth bearer helpers | JWT secret, user tables |
| Lifecycle `onStop` | `pool.end()` |

See also: [shutdown-recipe.md](./shutdown-recipe.md), [health-recipe.md](./health-recipe.md), [examples/notes-api](../examples/notes-api/).
