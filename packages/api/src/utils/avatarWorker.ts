import fs from 'fs/promises';
import path from 'path';
import { parentPort, workerData } from 'worker_threads';

import prisma from './prisma.js';

// 只实现头像清理任务
async function cleanupUnusedAvatarsWorker({
  uploadDir,
  maxAgeMs,
}: {
  uploadDir: string;
  maxAgeMs: number;
}) {
  try {
    const files = await fs.readdir(uploadDir);
    const avatarFiles = files.filter((name: string) => name.startsWith('avatar-'));
    if (avatarFiles.length === 0) return { removed: 0 };
    const users = await prisma.user.findMany({ select: { avatarUrl: true } });
    const inUse = new Set(
      users
        .map((u: { avatarUrl: string | null }) => u.avatarUrl)
        .filter((u: string | null): u is string => !!u && u.startsWith('/uploads/'))
        .map((u: string) => u.split('/').pop() as string)
    );
    let removed = 0;
    const now = Date.now();
    for (const fname of avatarFiles) {
      if (inUse.has(fname)) continue;
      const fpath = path.join(uploadDir, fname);
      try {
        const stat = await fs.stat(fpath);
        if (now - stat.mtimeMs < maxAgeMs) continue;
        await fs.unlink(fpath);
        removed++;
      } catch {}
    }
    return { removed };
  } catch {
    return { removed: 0 };
  }
}

if (parentPort) {
  cleanupUnusedAvatarsWorker(workerData).then((result) => {
    parentPort!.postMessage(result);
  });
}
