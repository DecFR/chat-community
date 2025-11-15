import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { getAvatarCleanupConfig } from './config.js';
import prisma from './prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

function isAvatarFile(name: string) {
  return name.startsWith('avatar-');
}

export async function cleanupUnusedAvatars(maxAgeOverride?: number) {
  try {
    const { maxAgeMs } = await getAvatarCleanupConfig();
    const effectiveMaxAge = typeof maxAgeOverride === 'number' ? maxAgeOverride : maxAgeMs;
    const files = await fs.readdir(UPLOAD_DIR);
    const avatarFiles = files.filter(isAvatarFile);

    if (avatarFiles.length === 0) return { removed: 0 };

    const users = await prisma.user.findMany({ select: { avatarUrl: true } });
    const inUse = new Set(
      users
        .map((u) => u.avatarUrl)
        .filter((u): u is string => !!u && u.startsWith('/uploads/'))
        .map((u) => u.split('/').pop() as string)
    );

    let removed = 0;
    const now = Date.now();

    for (const fname of avatarFiles) {
      if (inUse.has(fname)) continue; // 正在使用

      // 仅清理超过 maxAge 的文件，避免刚上传还未保存的临时文件被误删
      const fpath = path.join(UPLOAD_DIR, fname);
      try {
        const stat = await fs.stat(fpath);
        if (now - stat.mtimeMs < effectiveMaxAge) continue;
        await fs.unlink(fpath);
        removed++;
      } catch {
        // 忽略单个文件失败
      }
    }
    return { removed };
  } catch {
    return { removed: 0 };
  }
}
