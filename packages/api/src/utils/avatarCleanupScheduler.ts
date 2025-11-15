
import { Worker } from 'worker_threads';
import { getAvatarCleanupConfig } from './config';
import path from 'path';

let timer: NodeJS.Timer | null = null;

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
      console.log(`🧹 Cleanup avatars removed: ${res.removed}`);
    }
  }, intervalMs);

  // 首次延迟执行一次
  setTimeout(() => {
    runCleanupInWorker(maxAgeMs).then((r) => {
      if (r.removed) console.log(`🧹 Cleanup avatars removed: ${r.removed}`);
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
