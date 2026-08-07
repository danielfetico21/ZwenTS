/**
 * In-memory "database" for the notes-api example.
 * Swap this module for Drizzle/Kysely/pg — see docs/db-recipe.md.
 */

export type NoteRow = {
  id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: number;
};

export type Db = {
  notes: Map<string, NoteRow>;
  tokens: Map<string, string>; // token → userId
  /** Readiness probe — real drivers: `SELECT 1` / pool query. */
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
};

export function createMemoryDb(): Db {
  let open = true;
  return {
    notes: new Map(),
    tokens: new Map(),
    async ping() {
      return open;
    },
    async close() {
      open = false;
      // real drivers: await pool.end()
    },
  };
}
