import {
  ErrorCodes,
  appError,
  err,
  ok,
  type AppError,
  type Result,
} from "@zwents/core";
import type { EntryRow } from "./db.js";
import type { EntriesRepo } from "./entries-repo.js";
import type { ProjectsRepo } from "./projects-repo.js";

export type TimeEntry = {
  id: string;
  projectId: string | null;
  description: string;
  startedAt: number;
  stoppedAt: number | null;
  /** Computed duration; for running timers uses Date.now(). */
  durationMs: number;
  running: boolean;
};

function toEntry(row: EntryRow, now = Date.now()): TimeEntry {
  const running = row.stoppedAt === null;
  const end = row.stoppedAt ?? now;
  return {
    id: row.id,
    projectId: row.projectId,
    description: row.description,
    startedAt: row.startedAt,
    stoppedAt: row.stoppedAt,
    durationMs: Math.max(0, end - row.startedAt),
    running,
  };
}

export type EntriesService = {
  list: (
    userId: string,
    opts: { from?: number; to?: number; projectId?: string },
  ) => Promise<TimeEntry[]>;
  running: (userId: string) => Promise<TimeEntry | null>;
  start: (
    userId: string,
    input: { projectId?: string | null; description?: string },
  ) => Promise<Result<TimeEntry, AppError>>;
  stop: (
    userId: string,
    id?: string,
  ) => Promise<Result<TimeEntry, AppError>>;
  create: (
    userId: string,
    input: {
      projectId?: string | null;
      description?: string;
      startedAt: number;
      stoppedAt: number;
    },
  ) => Promise<Result<TimeEntry, AppError>>;
  remove: (
    userId: string,
    id: string,
  ) => Promise<Result<{ deleted: true }, AppError>>;
};

export function createEntriesService(
  repo: EntriesRepo,
  projects: ProjectsRepo,
): EntriesService {
  async function assertProject(
    userId: string,
    projectId: string | null | undefined,
  ): Promise<Result<string | null, AppError>> {
    if (projectId == null || projectId === "") return ok(null);
    const p = await projects.findById(projectId);
    if (!p || p.userId !== userId) {
      return err(
        appError(ErrorCodes.VALIDATION_ERROR, {
          detail: "Unknown projectId",
        }),
      );
    }
    return ok(projectId);
  }

  return {
    async list(userId, opts) {
      const rows = await repo.listByUser(userId, opts);
      const now = Date.now();
      return rows.map((r) => toEntry(r, now));
    },

    async running(userId) {
      const row = await repo.findRunning(userId);
      return row ? toEntry(row) : null;
    },

    async start(userId, input) {
      const existing = await repo.findRunning(userId);
      if (existing) {
        return err(
          appError(ErrorCodes.CONFLICT, {
            detail: "A timer is already running; stop it first",
            extras: { entryId: existing.id },
          }),
        );
      }
      const project = await assertProject(userId, input.projectId);
      if (!project.ok) return project;

      const row = await repo.insert({
        id: crypto.randomUUID(),
        userId,
        projectId: project.value,
        description: (input.description ?? "").trim(),
        startedAt: Date.now(),
        stoppedAt: null,
      });
      return ok(toEntry(row));
    },

    async stop(userId, id) {
      const row = id
        ? await repo.findById(id)
        : await repo.findRunning(userId);
      if (!row || row.userId !== userId) {
        return err(
          appError(ErrorCodes.NOT_FOUND, { detail: "Timer not found" }),
        );
      }
      if (row.stoppedAt !== null) {
        return err(
          appError(ErrorCodes.CONFLICT, { detail: "Timer already stopped" }),
        );
      }
      const updated = await repo.update({
        ...row,
        stoppedAt: Date.now(),
      });
      return ok(toEntry(updated));
    },

    async create(userId, input) {
      if (input.stoppedAt <= input.startedAt) {
        return err(
          appError(ErrorCodes.VALIDATION_ERROR, {
            detail: "stoppedAt must be after startedAt",
          }),
        );
      }
      const project = await assertProject(userId, input.projectId);
      if (!project.ok) return project;

      const row = await repo.insert({
        id: crypto.randomUUID(),
        userId,
        projectId: project.value,
        description: (input.description ?? "").trim(),
        startedAt: input.startedAt,
        stoppedAt: input.stoppedAt,
      });
      return ok(toEntry(row));
    },

    async remove(userId, id) {
      const deleted = await repo.deleteForUser(id, userId);
      if (!deleted) {
        return err(
          appError(ErrorCodes.NOT_FOUND, { detail: "Entry not found" }),
        );
      }
      return ok({ deleted: true as const });
    },
  };
}
