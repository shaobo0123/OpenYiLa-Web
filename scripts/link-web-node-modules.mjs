import { lstat, mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 仓库根目录（scripts/ 的上一级）
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webNodeModulesDir = path.join(rootDir, "apps", "web", "node_modules");
// 需要从根 node_modules 软链到 apps/web/node_modules 的包。
// 这些包被根 workspace 提升，但 apps/web 在 uni 编译期需要在自己的 node_modules 里能解析到。
const linkedPackages = ["wot-design-uni"];

for (const packageName of linkedPackages) {
  const target = path.join(rootDir, "node_modules", packageName);
  const link = path.join(webNodeModulesDir, packageName);

  // 源包必须存在（根 workspace 已安装），否则跳过
  try {
    await lstat(target);
  } catch {
    console.warn(`[postinstall] Skip ${packageName}: ${target} does not exist.`);
    continue;
  }

  await mkdir(path.dirname(link), { recursive: true });

  // 若已存在非符号链接的同名目录，保留它不覆盖；是符号链接则先删后建
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

  // Windows 上用 junction 避免需要管理员权限
  await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  console.log(`[postinstall] Linked ${packageName} into apps/web/node_modules.`);
}
