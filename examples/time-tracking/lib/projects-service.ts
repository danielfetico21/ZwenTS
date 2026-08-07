import {
  ErrorCodes,
  appError,
  err,
  ok,
  type AppError,
  type Result,
} from "@zwents/core";
import type { ProjectRow } from "./db.js";
import type { ProjectsRepo } from "./projects-repo.js";

export type Project = {
  id: string;
  name: string;
  color: string;
  createdAt: number;
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt,
  };
}

export type ProjectsService = {
  list: (userId: string) => Promise<Project[]>;
  create: (
    userId: string,
    input: { name: string; color?: string },
  ) => Promise<Result<Project, AppError>>;
  update: (
    userId: string,
    id: string,
    input: { name?: string; color?: string },
  ) => Promise<Result<Project, AppError>>;
  remove: (
    userId: string,
    id: string,
  ) => Promise<Result<{ deleted: true }, AppError>>;
};

const DEFAULT_COLORS = [
  "#0d9488",
  "#2563eb",
  "#ca8a04",
  "#dc2626",
  "#7c3aed",
  "#ea580c",
];

export function createProjectsService(repo: ProjectsRepo): ProjectsService {
  return {
    async list(userId) {
      const rows = await repo.listByUser(userId);
      return rows.map(toProject);
    },

    async create(userId, input) {
      const color =
        input.color ??
        DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]!;
      const row = await repo.insert({
        id: crypto.randomUUID(),
        userId,
        name: input.name.trim(),
        color,
        createdAt: Date.now(),
      });
      return ok(toProject(row));
    },

    async update(userId, id, input) {
      const existing = await repo.findById(id);
      if (!existing || existing.userId !== userId) {
        return err(
          appError(ErrorCodes.NOT_FOUND, { detail: "Project not found" }),
        );
      }
      const row = await repo.update({
        ...existing,
        name: input.name?.trim() ?? existing.name,
        color: input.color ?? existing.color,
      });
      return ok(toProject(row));
    },

    async remove(userId, id) {
      const deleted = await repo.deleteForUser(id, userId);
      if (!deleted) {
        return err(
          appError(ErrorCodes.NOT_FOUND, { detail: "Project not found" }),
        );
      }
      return ok({ deleted: true as const });
    },
  };
}
