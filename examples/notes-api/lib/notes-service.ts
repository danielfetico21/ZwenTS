import {
  ErrorCodes,
  appError,
  err,
  ok,
  type AppError,
  type Result,
} from "@zwents/core";
import type { NotesRepo } from "./notes-repo.js";
import type { NoteRow } from "./db.js";

export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
};

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
  };
}

export type NotesService = {
  create: (
    userId: string,
    input: { title: string; body: string },
  ) => Promise<Result<Note, AppError>>;
  get: (
    userId: string,
    id: string,
  ) => Promise<Result<Note, AppError>>;
  list: (
    userId: string,
    page: { limit: number; offset: number },
  ) => Promise<{ items: Note[]; total: number }>;
  remove: (
    userId: string,
    id: string,
  ) => Promise<Result<{ deleted: true }, AppError>>;
};

export function createNotesService(repo: NotesRepo): NotesService {
  return {
    async create(userId, input) {
      const row = await repo.insert({
        id: crypto.randomUUID(),
        userId,
        title: input.title,
        body: input.body,
        createdAt: Date.now(),
      });
      return ok(toNote(row));
    },

    async get(userId, id) {
      const row = await repo.findById(id);
      if (!row || row.userId !== userId) {
        return err(
          appError(ErrorCodes.NOT_FOUND, { detail: "Note not found" }),
        );
      }
      return ok(toNote(row));
    },

    async list(userId, page) {
      const { items, total } = await repo.listByUser(userId, page);
      return { items: items.map(toNote), total };
    },

    async remove(userId, id) {
      const deleted = await repo.deleteForUser(id, userId);
      if (!deleted) {
        return err(
          appError(ErrorCodes.NOT_FOUND, { detail: "Note not found" }),
        );
      }
      return ok({ deleted: true as const });
    },
  };
}
