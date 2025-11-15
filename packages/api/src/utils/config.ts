import prisma from './prisma';

export type AvatarCleanupConfig = {
  maxAgeMs: number;
  intervalMs: number;
};

export type ThreadPoolConfig = {
  maxThreads: number;
};

const KEYS = {
  AVATAR_MAX_AGE_MS: 'AVATAR_CLEANUP_MAX_AGE_MS',
  AVATAR_INTERVAL_MS: 'AVATAR_CLEANUP_INTERVAL_MS',
  THREAD_POOL_MAX: 'THREAD_POOL_MAX_THREADS',
} as const;

export async function getConfigValue(key: string): Promise<string | null> {
  const rec = await prisma.appConfig.findUnique({ where: { key } }).catch(() => null);
  return rec?.value ?? null;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getAvatarCleanupConfig(): Promise<AvatarCleanupConfig> {
  const envDefault: AvatarCleanupConfig = {
    maxAgeMs: Number(process.env.AVATAR_CLEANUP_MAX_AGE_MS) || 24 * 60 * 60 * 1000,
    intervalMs: Number(process.env.AVATAR_CLEANUP_INTERVAL_MS) || 6 * 60 * 60 * 1000,
  };

  const [maxAgeStr, intervalStr] = await Promise.all([
    getConfigValue(KEYS.AVATAR_MAX_AGE_MS),
    getConfigValue(KEYS.AVATAR_INTERVAL_MS),
  ]);

  return {
    maxAgeMs: maxAgeStr ? Math.max(0, Number(maxAgeStr)) : envDefault.maxAgeMs,
    intervalMs: intervalStr ? Math.max(60_000, Number(intervalStr)) : envDefault.intervalMs,
  };
}

export async function updateAvatarCleanupConfig(input: Partial<AvatarCleanupConfig>): Promise<AvatarCleanupConfig> {
  const current = await getAvatarCleanupConfig();
  const next: AvatarCleanupConfig = {
    maxAgeMs: typeof input.maxAgeMs === 'number' ? Math.max(0, input.maxAgeMs) : current.maxAgeMs,
    intervalMs: typeof input.intervalMs === 'number' ? Math.max(60_000, input.intervalMs) : current.intervalMs,
  };

  await Promise.all([
    setConfigValue(KEYS.AVATAR_MAX_AGE_MS, String(next.maxAgeMs)),
  await setConfigValue(KEYS.AVATAR_INTERVAL_MS, String(next.intervalMs)),
  ]);

  return next;
}

export async function getThreadPoolConfig(): Promise<ThreadPoolConfig> {
  const os = await import('os');
  const defaultMax = os.cpus().length;
  
  const maxStr = await getConfigValue(KEYS.THREAD_POOL_MAX);
  return {
    maxThreads: maxStr ? Math.max(1, Number(maxStr)) : defaultMax,
  };
}

export async function updateThreadPoolConfig(input: Partial<ThreadPoolConfig>): Promise<ThreadPoolConfig> {
  const current = await getThreadPoolConfig();
  const next: ThreadPoolConfig = {
    maxThreads: typeof input.maxThreads === 'number' ? Math.max(1, input.maxThreads) : current.maxThreads,
  };
  
  await setConfigValue(KEYS.THREAD_POOL_MAX, String(next.maxThreads));
  return next;
}
