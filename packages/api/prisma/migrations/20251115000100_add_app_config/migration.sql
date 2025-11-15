-- CreateTable
CREATE TABLE IF NOT EXISTS "AppConfig" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS "AppConfig_key_idx" ON "AppConfig" ("key");

-- 说明：Prisma 在应用层处理 @updatedAt 字段，无需数据库触发器。
