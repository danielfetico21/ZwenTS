# Database (no ORM in ZwenTS)

Wire a pool in `buildContainer()`, close on `onStop`. Migrations stay in the **app**.

```ts
import pg from "pg";

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  return {
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

createApp({
  context: services,
  onStop: [() => services.db.close()],
});
```

Same pattern for Drizzle / Kysely / Prisma — construct in the app, never a `@zwents/orm` package.

Full notes: monorepo `docs/db-recipe.md`.
