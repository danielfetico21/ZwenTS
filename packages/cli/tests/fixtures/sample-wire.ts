import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./create-db.mjs";

export default defineWire({ db: wire(createDb) });
