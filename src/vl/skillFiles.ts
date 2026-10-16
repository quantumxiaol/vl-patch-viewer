import { existsSync } from 'fs';
import { copyFile, mkdir, readdir } from 'fs/promises';
import * as path from 'path';

export interface CopyStats {
  copied: number;
  skipped: number;
}

export function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function copyMissing(source: string, target: string): Promise<CopyStats> {
  await mkdir(target, { recursive: true });
  const stats: CopyStats = { copied: 0, skipped: 0 };
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      const nested = await copyMissing(sourcePath, targetPath);
      stats.copied += nested.copied;
      stats.skipped += nested.skipped;
    } else if (existsSync(targetPath)) {
      stats.skipped++;
    } else {
      await copyFile(sourcePath, targetPath);
      stats.copied++;
    }
  }
  return stats;
}
