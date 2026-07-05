import { lstat, mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webNodeModulesDir = path.join(rootDir, "apps", "web", "node_modules");
const linkedPackages = ["wot-design-uni"];

for (const packageName of linkedPackages) {
  const target = path.join(rootDir, "node_modules", packageName);
  const link = path.join(webNodeModulesDir, packageName);

  try {
    await lstat(target);
  } catch {
    console.warn(`[postinstall] Skip ${packageName}: ${target} does not exist.`);
    continue;
  }

  await mkdir(path.dirname(link), { recursive: true });

  try {
    const existing = await lstat(link);
    if (!existing.isSymbolicLink()) {
      console.warn(`[postinstall] Skip ${packageName}: ${link} already exists.`);
      continue;
    }
    await rm(link, { force: true, recursive: true });
  } catch {
    // Link does not exist yet.
  }

  await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  console.log(`[postinstall] Linked ${packageName} into apps/web/node_modules.`);
}
