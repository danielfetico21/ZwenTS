import { createMemoryDb, type Db } from "./db.js";
import { createEntriesRepo } from "./entries-repo.js";
import {
  createEntriesService,
  type EntriesService,
} from "./entries-service.js";
import { createProjectsRepo } from "./projects-repo.js";
import {
  createProjectsService,
  type ProjectsService,
} from "./projects-service.js";
import { createTokenService, type TokenService } from "./tokens.js";

export type AppServices = {
  db: Db;
  tokens: TokenService;
  projects: ProjectsService;
  entries: EntriesService;
};

export function buildContainer(): AppServices {
  const db = createMemoryDb();
  const projectsRepo = createProjectsRepo(db);
  const entriesRepo = createEntriesRepo(db);
  return {
    db,
    tokens: createTokenService(db),
    projects: createProjectsService(projectsRepo),
    entries: createEntriesService(entriesRepo, projectsRepo),
  };
}
