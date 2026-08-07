import type { Db, ProjectRow } from "./db.js";

export type ProjectsRepo = {
  insert: (row: ProjectRow) => Promise<ProjectRow>;
  findById: (id: string) => Promise<ProjectRow | null>;
  listByUser: (userId: string) => Promise<ProjectRow[]>;
  update: (row: ProjectRow) => Promise<ProjectRow>;
  deleteForUser: (id: string, userId: string) => Promise<boolean>;
};

export function createProjectsRepo(db: Db): ProjectsRepo {
  return {
    async insert(row) {
      db.projects.set(row.id, row);
      return row;
    },
    async findById(id) {
      return db.projects.get(id) ?? null;
    },
    async listByUser(userId) {
      return [...db.projects.values()]
        .filter((p) => p.userId === userId)
        .toSorted((a, b) => a.name.localeCompare(b.name));
    },
    async update(row) {
      db.projects.set(row.id, row);
      return row;
    },
    async deleteForUser(id, userId) {
      const row = db.projects.get(id);
      if (!row || row.userId !== userId) return false;
      db.projects.delete(id);
      return true;
    },
  };
}
