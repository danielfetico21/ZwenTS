#!/usr/bin/env node
/**
 * Build packages/* and pack tarballs into .packs/ for local consumer installs.
 * pnpm rewrites workspace:* → concrete versions inside each tarball.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = join(root, ".packs");
const packagesDir = join(root, "packages");

function run(cmd, args, cwd = root) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

const names = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .toSorted();

if (names.length === 0) {
  console.error("No packages found under packages/");
  process.exit(1);
}

run("pnpm", ["-r", "--filter", "./packages/*", "run", "build"]);

if (existsSync(packsDir)) {
  rmSync(packsDir, { recursive: true, force: true });
}
mkdirSync(packsDir, { recursive: true });

for (const name of names) {
  const pkgDir = join(packagesDir, name);
  run(
    "pnpm",
    ["pack", "--pack-destination", packsDir],
    pkgDir,
  );
}

const tarballs = readdirSync(packsDir)
  .filter((f) => f.endsWith(".tgz"))
  .toSorted();

console.log("\nPacked into .packs/:");
for (const f of tarballs) {
  console.log(`  ${f}`);
}
console.log(`\nNext: cd playground/smoke && pnpm i && node index.mjs`);
