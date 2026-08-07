import { defineWire, wire } from "@zwents/cli/wire";
import { createMemoryDb } from "./lib/db.js";
import { createNotesRepo } from "./lib/notes-repo.js";
import { createNotesService } from "./lib/notes-service.js";
import { createTokenService } from "./lib/tokens.js";

/**
 * Wire manifest — run `pnpm gen:wire` to regenerate `lib/container.gen.ts`.
 */
export default defineWire({
  providers: {
    db: wire(createMemoryDb),
    notesRepo: wire(createNotesRepo, ["db"]),
    notes: wire(createNotesService, ["notesRepo"]),
    tokens: wire(createTokenService, ["db"]),
  },
  expose: ["db", "notes", "tokens"],
});
