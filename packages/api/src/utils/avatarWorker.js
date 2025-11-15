const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs').promises;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupUnusedAvatarsWorker({ uploadDir, maxAgeMs }) {
  try {
    const files = await fs.readdir(uploadDir);
    const avatarFiles = files.filter((name) => name.startsWith('avatar-'));
    if (avatarFiles.length === 0) return { removed: 0 };
    const users = await prisma.user.findMany({ select: { avatarUrl: true } });
    const inUse = new Set(
      users
        .map((u) => u.avatarUrl)
        .filter((u) => !!u && u.startsWith('/uploads/'))
        .map((u) => u.split('/').pop())
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
    parentPort.postMessage(result);
    prisma.$disconnect();
  });
}
