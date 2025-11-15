import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

import { getAvatarCleanupConfig } from './config.js';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let timer: NodeJS.Timeout | null = null;

function runCleanupInWorker(maxAgeMs: number): Promise<{ removed: number }> {
  return new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, 'avatarWorker.js'), {
      workerData: {
        uploadDir: path.join(__dirname, '../../uploads'),
        maxAgeMs,
      },
    });
    worker.on('message', (result) => resolve(result));
    worker.on('error', () => resolve({ removed: 0 }));
    worker.on('exit', (code) => {
      if (code !== 0) resolve({ removed: 0 });
    });
  });
}

export async function startAvatarCleanupScheduler() {
  const { intervalMs, maxAgeMs } = await getAvatarCleanupConfig();
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    const res = await runCleanupInWorker(maxAgeMs);
    if (res.removed) {
      logger.info(`🧹 Cleanup avatars removed: ${res.removed}`);
    }
  }, intervalMs);

  // 首次延迟执行一次
  setTimeout(() => {
    runCleanupInWorker(maxAgeMs).then((r) => {
      if (r.removed) logger.info(`🧹 Cleanup avatars removed: ${r.removed}`);
    });
  }, 10_000);
}

export async function rescheduleAvatarCleanupScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await startAvatarCleanupScheduler();
}
