import type { Db, EntryRow } from "./db.js";

export type EntriesRepo = {
  insert: (row: EntryRow) => Promise<EntryRow>;
  findById: (id: string) => Promise<EntryRow | null>;
  findRunning: (userId: string) => Promise<EntryRow | null>;
  listByUser: (
    userId: string,
    opts: { from?: number; to?: number; projectId?: string },
  ) => Promise<EntryRow[]>;
  update: (row: EntryRow) => Promise<EntryRow>;
  deleteForUser: (id: string, userId: string) => Promise<boolean>;
};

export function createEntriesRepo(db: Db): EntriesRepo {
  return {
    async insert(row) {
      db.entries.set(row.id, row);
      return row;
    },
    async findById(id) {
      return db.entries.get(id) ?? null;
    },
    async findRunning(userId) {
      for (const row of db.entries.values()) {
        if (row.userId === userId && row.stoppedAt === null) return row;
      }
      return null;
    },
    async listByUser(userId, opts) {
      return [...db.entries.values()]
        .filter((e) => {
          if (e.userId !== userId) return false;
          if (opts.projectId && e.projectId !== opts.projectId) return false;
          if (opts.from !== undefined && e.startedAt < opts.from) return false;
          if (opts.to !== undefined && e.startedAt > opts.to) return false;
          return true;
        })
        .toSorted((a, b) => b.startedAt - a.startedAt);
    },
    async update(row) {
      db.entries.set(row.id, row);
      return row;
    },
    async deleteForUser(id, userId) {
      const row = db.entries.get(id);
      if (!row || row.userId !== userId) return false;
      db.entries.delete(id);
      return true;
    },
  };
}
