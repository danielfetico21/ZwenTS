import type { Db, NoteRow } from "./db.js";

export type NotesRepo = {
  insert: (row: NoteRow) => Promise<NoteRow>;
  findById: (id: string) => Promise<NoteRow | null>;
  listByUser: (
    userId: string,
    opts: { limit: number; offset: number },
  ) => Promise<{ items: NoteRow[]; total: number }>;
  deleteForUser: (id: string, userId: string) => Promise<boolean>;
};

export function createNotesRepo(db: Db): NotesRepo {
  return {
    async insert(row) {
      db.notes.set(row.id, row);
      return row;
    },

    async findById(id) {
      return db.notes.get(id) ?? null;
    },

    async listByUser(userId, opts) {
      const all = [...db.notes.values()]
        .filter((n) => n.userId === userId)
        .toSorted((a, b) => b.createdAt - a.createdAt);
      return {
        total: all.length,
        items: all.slice(opts.offset, opts.offset + opts.limit),
      };
    },

    async deleteForUser(id, userId) {
      const row = db.notes.get(id);
      if (!row || row.userId !== userId) return false;
      db.notes.delete(id);
      return true;
    },
  };
}
