import { parentPort, workerData } from 'worker_threads';
import path from 'path';
import fs from 'fs/promises';
import prisma from './prisma';

// 只实现头像清理任务
async function cleanupUnusedAvatarsWorker({ uploadDir, maxAgeMs }: { uploadDir: string; maxAgeMs: number }) {
  try {
    const files = await fs.readdir(uploadDir);
    const avatarFiles = files.filter((name) => name.startsWith('avatar-'));
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
  } catch (e) {
    return { removed: 0 };
  }
}

if (parentPort) {
  cleanupUnusedAvatarsWorker(workerData).then((result) => {
    parentPort!.postMessage(result);
  });
}
