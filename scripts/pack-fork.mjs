#!/usr/bin/env node
/**
 * pack-fork.mjs — build a publish-shaped npm tarball of the forked `t3`
 * server package (see FORK.md) without publishing to npm.
 *
 * Mirrors apps/server/scripts/cli.ts `publish`: temporarily rewrites
 * apps/server/package.json with catalog: deps resolved to real versions,
 * runs `pnpm pack`, then restores the original file. Run AFTER
 * `vp run build` in apps/server (dist/bin.mjs + dist/client must exist).
 *
 * Usage: node scripts/pack-fork.mjs [--version 0.0.31-agy.1]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const repoRoot = resolve(join(import.meta.dirname, ".."));
const serverDir = join(repoRoot, "apps/server");
const packageJsonPath = join(serverDir, "package.json");

const versionFlagIndex = process.argv.indexOf("--version");
const versionOverride = versionFlagIndex >= 0 ? process.argv[versionFlagIndex + 1] : undefined;

for (const asset of ["dist/bin.mjs", "dist/service-launcher.mjs", "dist/client/index.html"]) {
  if (!existsSync(join(serverDir, asset))) {
    console.error(`[pack-fork] Missing build asset ${asset} — run \`vp run build\` in apps/server first.`);
    process.exit(1);
  }
}

const original = readFileSync(packageJsonPath, "utf8");
const pkg = JSON.parse(original);
const workspace = parseYaml(readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8"));
const catalog = workspace.catalog ?? {};

function resolveCatalog(deps) {
  const out = {};
  for (const [name, spec] of Object.entries(deps ?? {})) {
    if (spec === "catalog:") {
      const resolved = catalog[name];
      if (!resolved) {
        console.error(`[pack-fork] No catalog entry for ${name}`);
        process.exit(1);
      }
      out[name] = resolved;
    } else {
      out[name] = spec;
    }
  }
  return out;
}

const version = versionOverride ?? `${pkg.version}-agy.${Math.floor(Date.now() / 1000)}`;
const publishPkg = {
  name: pkg.name,
  repository: pkg.repository,
  bin: pkg.bin,
  type: pkg.type,
  version,
  engines: pkg.engines,
  files: pkg.files,
  dependencies: resolveCatalog(pkg.dependencies),
  overrides: resolveCatalog(workspace.overrides ?? {}),
};

try {
  writeFileSync(packageJsonPath, `${JSON.stringify(publishPkg, null, 2)}\n`);
  execFileSync("pnpm", ["pack"], { cwd: serverDir, stdio: "inherit" });
} finally {
  writeFileSync(packageJsonPath, original);
}

const tarball = readdirSync(serverDir).find(
  (name) => name.startsWith("t3-") && name.endsWith(".tgz") && name.includes(version),
);
console.log(`\n[pack-fork] Done: apps/server/${tarball ?? "(tarball not found?)"} (version ${version})`);
