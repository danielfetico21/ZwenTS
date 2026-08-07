/**
 * In-memory store for the time-tracking demo.
 * Swap for a real driver — see docs/db-recipe.md.
 */

export type ProjectRow = {
  id: string;
  userId: string;
  name: string;
  color: string;
  createdAt: number;
};

export type EntryRow = {
  id: string;
  userId: string;
  projectId: string | null;
  description: string;
  startedAt: number;
  /** null = timer still running */
  stoppedAt: number | null;
};

export type Db = {
  projects: Map<string, ProjectRow>;
  entries: Map<string, EntryRow>;
  tokens: Map<string, string>;
  close: () => Promise<void>;
};

export function createMemoryDb(): Db {
  return {
    projects: new Map(),
    entries: new Map(),
    tokens: new Map(),
    async close() {},
  };
}
